use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex
  },
  time::{Duration, Instant, SystemTime, UNIX_EPOCH}
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_shell::process::CommandEvent;

use crate::ffmpeg::resolve_ffmpeg_command;

#[derive(Default)]
pub struct PixelsortJobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl PixelsortJobs {
  pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    let flag = Arc::new(AtomicBool::new(false));
    lock.insert(job_id.to_string(), flag.clone());
    flag
  }

  pub fn cancel(&self, job_id: &str) -> bool {
    let lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    if let Some(flag) = lock.get(job_id) {
      flag.store(true, Ordering::Relaxed);
      return true;
    }
    false
  }

  pub fn finish(&self, job_id: &str) {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    lock.remove(job_id);
  }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelsortConfig {
  pub intensity: f32,
  pub threshold: f32,
  pub max_threshold: f32,
  pub block_size: u32,
  pub direction: String
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelsortEncoding {
  pub encoder: String,
  pub preset: String,
  pub crf: Option<u32>,
  pub cq: Option<u32>,
  pub max_bitrate_kbps: Option<u32>
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PixelsortProgress {
  job_id: String,
  frame: u64,
  total_frames: Option<u64>,
  percent: f64,
  fps: Option<f64>,
  speed: Option<f64>,
  out_time_seconds: Option<f64>,
  elapsed_seconds: Option<f64>,
  eta_seconds: Option<f64>
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PixelsortLog {
  job_id: String,
  message: String
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PixelsortPreviewEvent {
  job_id: String,
  frame: u64,
  path: String
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PixelsortPreviewResponse {
  path: String
}

#[derive(Clone, Copy)]
enum SortDirection {
  Horizontal,
  Vertical,
  Block
}

fn parse_direction(value: &str) -> SortDirection {
  match value {
    "vertical" => SortDirection::Vertical,
    "block" => SortDirection::Block,
    _ => SortDirection::Horizontal
  }
}

fn emit_log(window: &Window, job_id: &str, message: impl Into<String>) {
  let payload = PixelsortLog {
    job_id: job_id.to_string(),
    message: message.into()
  };
  let _ = window.emit("pixelsort-log", payload);
}

fn emit_progress(
  window: &Window,
  job_id: &str,
  frame: u64,
  total_frames: Option<u64>,
  fps: Option<f64>,
  speed: Option<f64>,
  out_time_seconds: Option<f64>,
  elapsed_seconds: Option<f64>,
  eta_seconds: Option<f64>
) {
  let percent = total_frames
    .filter(|total| *total > 0)
    .map(|total| (frame as f64 / total as f64) * 100.0)
    .unwrap_or(0.0);
  let payload = PixelsortProgress {
    job_id: job_id.to_string(),
    frame,
    total_frames,
    percent,
    fps,
    speed,
    out_time_seconds,
    elapsed_seconds,
    eta_seconds
  };
  let _ = window.emit("pixelsort-progress", payload);
}

fn emit_preview(window: &Window, job_id: &str, frame: u64, path: &Path) {
  let payload = PixelsortPreviewEvent {
    job_id: job_id.to_string(),
    frame,
    path: path.to_string_lossy().into_owned()
  };
  let _ = window.emit("pixelsort-preview", payload);
}

fn luma(r: u8, g: u8, b: u8) -> u8 {
  // Use standard luma weights to preserve perceptual brightness.
  let value = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;
  value.round().clamp(0.0, 255.0) as u8
}

fn blend_channel(a: u8, b: u8, mix: f32) -> u8 {
  let inv = 1.0 - mix;
  ((a as f32 * inv) + (b as f32 * mix)).round().clamp(0.0, 255.0) as u8
}

// Reusable buffers for per-frame processing to avoid extra allocations.
struct FrameWorkspace {
  width: usize,
  height: usize,
  pixel_count: usize,
  output: Vec<u8>,
  luma: Vec<u8>,
  scratch: Vec<u8>,
  segment_indices: Vec<usize>,
  luma_counts: [usize; 256],
  luma_offsets: [usize; 256]
}

impl FrameWorkspace {
  fn new(width: usize, height: usize) -> Self {
    let pixel_count = width.saturating_mul(height);
    let byte_len = pixel_count * 4;
    Self {
      width,
      height,
      pixel_count,
      output: vec![0; byte_len],
      luma: vec![0; pixel_count],
      scratch: vec![0; byte_len],
      segment_indices: Vec::with_capacity(width.max(height)),
      luma_counts: [0; 256],
      luma_offsets: [0; 256]
    }
  }

  // Copies input into the output buffer and precomputes luma for fast access.
  fn prepare(&mut self, input: &[u8]) {
    if self.output.len() != input.len() {
      self.output.resize(input.len(), 0);
    }
    if self.scratch.len() != input.len() {
      self.scratch.resize(input.len(), 0);
    }
    self.output.copy_from_slice(input);
    if self.luma.len() != self.pixel_count {
      self.luma.resize(self.pixel_count, 0);
    }
    for i in 0..self.pixel_count {
      let idx = i * 4;
      self.luma[i] = luma(input[idx], input[idx + 1], input[idx + 2]);
    }
  }

  // Ensures the segment buffer can hold the largest segment we might sort.
  fn ensure_segment_capacity(&mut self, needed: usize) {
    if self.segment_indices.capacity() < needed {
      self.segment_indices.reserve(needed - self.segment_indices.capacity());
    }
  }


  fn output(&self) -> &[u8] {
    &self.output
  }
}

fn ensure_segment_capacity(segment_indices: &mut Vec<usize>, needed: usize) {
  if segment_indices.capacity() < needed {
    segment_indices.reserve(needed - segment_indices.capacity());
  }
}

// Fills segment_indices with indices sorted by luma descending (counting sort).
fn sort_row_segment_by_luma(
  luma_map: &[u8],
  row_start: usize,
  start: usize,
  end: usize,
  segment_indices: &mut Vec<usize>,
  luma_counts: &mut [usize; 256],
  luma_offsets: &mut [usize; 256]
) -> usize {
  let segment_len = end.saturating_sub(start);
  if segment_len == 0 {
    segment_indices.clear();
    return 0;
  }
  ensure_segment_capacity(segment_indices, segment_len);
  segment_indices.resize(segment_len, 0);
  luma_counts.fill(0);

  for x in start..end {
    let idx = row_start + x;
    let lum = luma_map[idx] as usize;
    luma_counts[lum] += 1;
  }

  let mut offset = 0usize;
  for lum in (0..=255).rev() {
    luma_offsets[lum] = offset;
    offset += luma_counts[lum];
  }

  for x in start..end {
    let idx = row_start + x;
    let lum = luma_map[idx] as usize;
    let dest = luma_offsets[lum];
    segment_indices[dest] = idx;
    luma_offsets[lum] += 1;
  }

  segment_len
}

// Fills segment_indices with indices sorted by luma descending (counting sort).
fn sort_col_segment_by_luma(
  luma_map: &[u8],
  width: usize,
  x: usize,
  start: usize,
  end: usize,
  segment_indices: &mut Vec<usize>,
  luma_counts: &mut [usize; 256],
  luma_offsets: &mut [usize; 256]
) -> usize {
  let segment_len = end.saturating_sub(start);
  if segment_len == 0 {
    segment_indices.clear();
    return 0;
  }
  ensure_segment_capacity(segment_indices, segment_len);
  segment_indices.resize(segment_len, 0);
  luma_counts.fill(0);

  for y in start..end {
    let idx = y * width + x;
    let lum = luma_map[idx] as usize;
    luma_counts[lum] += 1;
  }

  let mut offset = 0usize;
  for lum in (0..=255).rev() {
    luma_offsets[lum] = offset;
    offset += luma_counts[lum];
  }

  for y in start..end {
    let idx = y * width + x;
    let lum = luma_map[idx] as usize;
    let dest = luma_offsets[lum];
    segment_indices[dest] = idx;
    luma_offsets[lum] += 1;
  }

  segment_len
}

// Fills segment_indices with indices sorted by luma descending (counting sort).
fn sort_block_by_luma(
  luma_map: &[u8],
  width: usize,
  start_x: usize,
  start_y: usize,
  end_x: usize,
  end_y: usize,
  segment_indices: &mut Vec<usize>,
  luma_counts: &mut [usize; 256],
  luma_offsets: &mut [usize; 256]
) -> usize {
  let block_width = end_x.saturating_sub(start_x);
  let block_height = end_y.saturating_sub(start_y);
  let segment_len = block_width.saturating_mul(block_height);
  if segment_len == 0 {
    segment_indices.clear();
    return 0;
  }
  ensure_segment_capacity(segment_indices, segment_len);
  segment_indices.resize(segment_len, 0);
  luma_counts.fill(0);

  for y in start_y..end_y {
    for x in start_x..end_x {
      let idx = y * width + x;
      let lum = luma_map[idx] as usize;
      luma_counts[lum] += 1;
    }
  }

  let mut offset = 0usize;
  for lum in (0..=255).rev() {
    luma_offsets[lum] = offset;
    offset += luma_counts[lum];
  }

  for y in start_y..end_y {
    for x in start_x..end_x {
      let idx = y * width + x;
      let lum = luma_map[idx] as usize;
      let dest = luma_offsets[lum];
      segment_indices[dest] = idx;
      luma_offsets[lum] += 1;
    }
  }

  segment_len
}

fn clamp_u8(value: i32) -> u8 {
  value.clamp(0, 255) as u8
}

fn in_luma_band(value: u8, min: u8, max: u8) -> bool {
  value >= min && value <= max
}

fn resolve_luma_band(mut min_threshold: i32, mut max_threshold: i32) -> (u8, u8) {
  min_threshold = min_threshold.clamp(0, 255);
  max_threshold = max_threshold.clamp(0, 255);
  if min_threshold > max_threshold {
    std::mem::swap(&mut min_threshold, &mut max_threshold);
  }
  (min_threshold as u8, max_threshold as u8)
}

// Sorts contiguous luma-band runs along rows, then blends them back into the output.
fn pixelsort_horizontal(
  input: &[u8],
  workspace: &mut FrameWorkspace,
  width: usize,
  height: usize,
  min_threshold: u8,
  max_threshold: u8,
  min_segment: usize,
  strength: f32
) {
  let FrameWorkspace {
    luma,
    output,
    scratch,
    segment_indices,
    luma_counts,
    luma_offsets,
    ..
  } = workspace;
  let luma_map = luma.as_slice();
  for y in 0..height {
    let row_start = y * width;
    let row_min = min_threshold;
    let row_max = max_threshold;

    let mut x = 0;
    while x < width {
      let pixel_index = row_start + x;
      let lum = luma_map[pixel_index];
      if in_luma_band(lum, row_min, row_max) {
        let start = x;
        x += 1;
        while x < width {
          let next_pixel = row_start + x;
          let next_lum = luma_map[next_pixel];
          if !in_luma_band(next_lum, row_min, row_max) {
            break;
          }
          x += 1;
        }
        let end = x;
        if end - start >= min_segment {
          let segment_len = sort_row_segment_by_luma(
            luma_map,
            row_start,
            start,
            end,
            segment_indices,
            luma_counts,
            luma_offsets
          );
          let byte_len = segment_len * 4;
          let segment_bytes = &mut scratch[..byte_len];
          for (offset, source_pixel) in segment_indices.iter().enumerate() {
            let s_idx = source_pixel * 4;
            let d_idx = offset * 4;
            segment_bytes[d_idx] = input[s_idx];
            segment_bytes[d_idx + 1] = input[s_idx + 1];
            segment_bytes[d_idx + 2] = input[s_idx + 2];
            segment_bytes[d_idx + 3] = input[s_idx + 3];
          }
          let dest_start = row_start * 4 + start * 4;
          let dest_end = dest_start + byte_len;
          if strength >= 0.999 {
            output[dest_start..dest_end].copy_from_slice(segment_bytes);
          } else {
            for offset in 0..segment_len {
              let src_idx = offset * 4;
              let dst_idx = dest_start + src_idx;
              output[dst_idx] =
                blend_channel(output[dst_idx], segment_bytes[src_idx], strength);
              output[dst_idx + 1] =
                blend_channel(output[dst_idx + 1], segment_bytes[src_idx + 1], strength);
              output[dst_idx + 2] =
                blend_channel(output[dst_idx + 2], segment_bytes[src_idx + 2], strength);
              output[dst_idx + 3] = segment_bytes[src_idx + 3];
            }
          }
        }
      } else {
        x += 1;
      }
    }
  }
}

// Vertical pass for the same luma-band sorting behavior.
fn pixelsort_vertical(
  input: &[u8],
  workspace: &mut FrameWorkspace,
  width: usize,
  height: usize,
  min_threshold: u8,
  max_threshold: u8,
  min_segment: usize,
  strength: f32
) {
  let FrameWorkspace {
    luma,
    output,
    scratch,
    segment_indices,
    luma_counts,
    luma_offsets,
    ..
  } = workspace;
  let luma_map = luma.as_slice();
  for x in 0..width {
    let col_min = min_threshold;
    let col_max = max_threshold;

    let mut y = 0;
    while y < height {
      let pixel_index = y * width + x;
      let lum = luma_map[pixel_index];
      if in_luma_band(lum, col_min, col_max) {
        let start = y;
        y += 1;
        while y < height {
          let next_pixel = y * width + x;
          let next_lum = luma_map[next_pixel];
          if !in_luma_band(next_lum, col_min, col_max) {
            break;
          }
          y += 1;
        }
        let end = y;
        if end - start >= min_segment {
          let segment_len = sort_col_segment_by_luma(
            luma_map,
            width,
            x,
            start,
            end,
            segment_indices,
            luma_counts,
            luma_offsets
          );
          let byte_len = segment_len * 4;
          let segment_bytes = &mut scratch[..byte_len];
          for (offset, source_pixel) in segment_indices.iter().enumerate() {
            let s_idx = source_pixel * 4;
            let d_idx = offset * 4;
            segment_bytes[d_idx] = input[s_idx];
            segment_bytes[d_idx + 1] = input[s_idx + 1];
            segment_bytes[d_idx + 2] = input[s_idx + 2];
            segment_bytes[d_idx + 3] = input[s_idx + 3];
          }
          for offset in 0..segment_len {
            let src_idx = offset * 4;
            let dst_idx = ((start + offset) * width + x) * 4;
            if strength >= 0.999 {
              output[dst_idx] = segment_bytes[src_idx];
              output[dst_idx + 1] = segment_bytes[src_idx + 1];
              output[dst_idx + 2] = segment_bytes[src_idx + 2];
              output[dst_idx + 3] = segment_bytes[src_idx + 3];
            } else {
              output[dst_idx] =
                blend_channel(output[dst_idx], segment_bytes[src_idx], strength);
              output[dst_idx + 1] =
                blend_channel(output[dst_idx + 1], segment_bytes[src_idx + 1], strength);
              output[dst_idx + 2] =
                blend_channel(output[dst_idx + 2], segment_bytes[src_idx + 2], strength);
              output[dst_idx + 3] = segment_bytes[src_idx + 3];
            }
          }
        }
      } else {
        y += 1;
      }
    }
  }
}

// Block mode sorts pixels inside small tiles for a chunkier look.
fn pixelsort_block(
  input: &[u8],
  workspace: &mut FrameWorkspace,
  width: usize,
  height: usize,
  min_threshold: u8,
  max_threshold: u8,
  block_size: usize,
  strength: f32
) {
  let FrameWorkspace {
    luma,
    output,
    scratch: _scratch,
    segment_indices,
    luma_counts,
    luma_offsets,
    ..
  } = workspace;
  let luma_map = luma.as_slice();
  let mut by = 0;
  while by < height {
    let mut bx = 0;
    while bx < width {
      let end_x = (bx + block_size).min(width);
      let end_y = (by + block_size).min(height);
      let mut luma_total = 0u64;
      let mut count = 0u64;

      for y in by..end_y {
        for x in bx..end_x {
          let pixel_index = y * width + x;
          luma_total += luma_map[pixel_index] as u64;
          count += 1;
        }
      }

      let avg = if count > 0 { (luma_total / count) as u8 } else { 0 };

      if in_luma_band(avg, min_threshold, max_threshold) {
        let _segment_len = sort_block_by_luma(
          luma_map,
          width,
          bx,
          by,
          end_x,
          end_y,
          segment_indices,
          luma_counts,
          luma_offsets
        );
        let mut offset = 0usize;
        for y in by..end_y {
          for x in bx..end_x {
            let idx = (y * width + x) * 4;
            let source_pixel = segment_indices[offset];
            let s_idx = source_pixel * 4;
            if strength >= 0.999 {
              output[idx] = input[s_idx];
              output[idx + 1] = input[s_idx + 1];
              output[idx + 2] = input[s_idx + 2];
              output[idx + 3] = input[s_idx + 3];
            } else {
              output[idx] = blend_channel(output[idx], input[s_idx], strength);
              output[idx + 1] = blend_channel(
                output[idx + 1],
                input[s_idx + 1],
                strength
              );
              output[idx + 2] = blend_channel(
                output[idx + 2],
                input[s_idx + 2],
                strength
              );
              output[idx + 3] = input[s_idx + 3];
            }
            offset += 1;
          }
        }
      }

      bx += block_size;
    }
    by += block_size;
  }
}

// Processes a single frame in-place using cached buffers for speed.
fn pixelsort_frame<'a>(
  input: &[u8],
  workspace: &'a mut FrameWorkspace,
  config: &PixelsortConfig,
  frame_index: u64
) -> &'a [u8] {
  workspace.prepare(input);
  // Intensity is now the blend strength between original and sorted pixels.
  let strength = (config.intensity / 100.0).clamp(0.0, 1.0);
  let block_size = (config.block_size.max(2)) as usize;
  // Sort any run longer than 1 pixel for a more aggressive smear.
  let min_segment = 2;
  let min_threshold = config.threshold.round() as i32;
  let max_threshold = config.max_threshold.round() as i32;
  let (min_threshold, max_threshold) = resolve_luma_band(min_threshold, max_threshold);

  let width = workspace.width;
  let height = workspace.height;
  let block_capacity = block_size.saturating_mul(block_size);
  workspace.ensure_segment_capacity(width.max(height).max(block_capacity));

  if strength > 0.001 {
    match parse_direction(config.direction.as_str()) {
      SortDirection::Horizontal => pixelsort_horizontal(
        input,
        workspace,
        width,
        height,
        min_threshold,
        max_threshold,
        min_segment,
        strength
      ),
      SortDirection::Vertical => pixelsort_vertical(
        input,
        workspace,
        width,
        height,
        min_threshold,
        max_threshold,
        min_segment,
        strength
      ),
      SortDirection::Block => pixelsort_block(
        input,
        workspace,
        width,
        height,
        min_threshold,
        max_threshold,
        block_size,
        strength
      )
    }
  }

  apply_pixelsort_fx(workspace, frame_index);

  workspace.output()
}

// Applies a lightweight post-processing stack for the classic pixel-sort look.
fn apply_pixelsort_fx(
  workspace: &mut FrameWorkspace,
  frame_index: u64
) {
  // Post stack: chroma shift, grayscale, brightness.
  let chroma_shift = 2;
  if chroma_shift > 0 {
    chroma_shift_horizontal(
      &workspace.output,
      &mut workspace.scratch,
      workspace.width,
      workspace.height,
      chroma_shift
    );
    workspace.output.copy_from_slice(&workspace.scratch);
  }

  let gray_mix = 0.275;
  // Noise removed to keep output sizes predictable on high-variance frames.
  let noise_amount = 0.0;
  let brightness = -2.0;
  apply_grade_noise(
    &mut workspace.output,
    workspace.width,
    workspace.height,
    gray_mix,
    noise_amount,
    brightness,
    1337,
    frame_index
  );
}

fn chroma_shift_horizontal(
  src: &[u8],
  dst: &mut [u8],
  width: usize,
  height: usize,
  shift: i32
) {
  for y in 0..height {
    for x in 0..width {
      let r_x = (x as i32 + shift).clamp(0, (width - 1) as i32) as usize;
      let b_x = (x as i32 - shift).clamp(0, (width - 1) as i32) as usize;
      let idx = (y * width + x) * 4;
      let r_idx = (y * width + r_x) * 4;
      let b_idx = (y * width + b_x) * 4;
      dst[idx] = src[r_idx];
      dst[idx + 1] = src[idx + 1];
      dst[idx + 2] = src[b_idx + 2];
      dst[idx + 3] = src[idx + 3];
    }
  }
}

fn apply_grade_noise(
  buffer: &mut [u8],
  width: usize,
  height: usize,
  gray_mix: f32,
  noise_amount: f32,
  brightness: f32,
  seed: u32,
  frame_index: u64
) {
  let mut rng = seed ^ (frame_index as u32).wrapping_mul(1664525);
  let noise_amp = noise_amount.round().clamp(0.0, 24.0) as i32;
  let bright = brightness.round() as i32;
  let use_noise = noise_amp > 0;

  for y in 0..height {
    for x in 0..width {
      let idx = (y * width + x) * 4;
      let r = buffer[idx];
      let g = buffer[idx + 1];
      let b = buffer[idx + 2];
      let gray = luma(r, g, b);
      let mixed_r = blend_channel(r, gray, gray_mix);
      let mixed_g = blend_channel(g, gray, gray_mix);
      let mixed_b = blend_channel(b, gray, gray_mix);

      let noise = if use_noise {
        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
        let sample = ((rng >> 16) & 0xFF) as i32;
        (sample % (noise_amp * 2 + 1)) - noise_amp
      } else {
        0
      };

      buffer[idx] = clamp_u8(mixed_r as i32 + bright + noise);
      buffer[idx + 1] = clamp_u8(mixed_g as i32 + bright + noise);
      buffer[idx + 2] = clamp_u8(mixed_b as i32 + bright + noise);
    }
  }
}

fn build_temp_video_path(output_path: &str) -> PathBuf {
  let output = PathBuf::from(output_path);
  let stem = output
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("pixelsort");
  let file_name = format!("{stem}.pixelsort.video.mp4");
  output.with_file_name(file_name)
}

fn cleanup_file(path: &Path) {
  for _ in 0..6 {
    match std::fs::remove_file(path) {
      Ok(_) => return,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
      Err(_) => std::thread::sleep(Duration::from_millis(120)),
    }
  }
}

fn build_preview_path(tag: &str) -> PathBuf {
  let safe_tag = tag.replace(|c: char| !c.is_ascii_alphanumeric(), "_");
  let file_name = format!("bitrot-preview-{safe_tag}.png");
  std::env::temp_dir().join(file_name)
}

const MAX_PREVIEW_DIMENSION: u32 = 1280;

fn resolve_preview_size(width: u32, height: u32) -> (u32, u32) {
  let max_dim = width.max(height);
  if max_dim <= MAX_PREVIEW_DIMENSION {
    return (width, height);
  }

  let scale = MAX_PREVIEW_DIMENSION as f64 / max_dim as f64;
  let scaled_width = ((width as f64) * scale).round().max(1.0) as u32;
  let scaled_height = ((height as f64) * scale).round().max(1.0) as u32;
  (scaled_width, scaled_height)
}

// Simple nearest-neighbor resize for preview buffers.
fn downscale_rgba_nearest(
  src: &[u8],
  src_width: u32,
  src_height: u32,
  dst_width: u32,
  dst_height: u32
) -> Vec<u8> {
  if src_width == dst_width && src_height == dst_height {
    return src.to_vec();
  }

  let mut dst = vec![0u8; (dst_width as usize) * (dst_height as usize) * 4];
  for y in 0..dst_height {
    let src_y = (y as u64 * src_height as u64 / dst_height as u64) as u32;
    for x in 0..dst_width {
      let src_x = (x as u64 * src_width as u64 / dst_width as u64) as u32;
      let src_idx = ((src_y * src_width + src_x) * 4) as usize;
      let dst_idx = ((y * dst_width + x) * 4) as usize;
      dst[dst_idx..dst_idx + 4].copy_from_slice(&src[src_idx..src_idx + 4]);
    }
  }
  dst
}

fn build_preview_raw_path(tag: &str) -> PathBuf {
  let safe_tag = tag.replace(|c: char| !c.is_ascii_alphanumeric(), "_");
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|value| value.as_nanos())
    .unwrap_or(0);
  let file_name = format!("bitrot-preview-{safe_tag}-{nonce}.rgba");
  std::env::temp_dir().join(file_name)
}

// Normalizes paths for comparison without touching the filesystem.
fn normalize_path_for_compare(value: &str) -> String {
  value
    .trim()
    .trim_matches('"')
    .replace('\\', "/")
    .trim_end_matches('/')
    .to_string()
}

fn paths_match(left: &str, right: &str) -> bool {
  let left = normalize_path_for_compare(left);
  let right = normalize_path_for_compare(right);
  if left.is_empty() || right.is_empty() {
    return false;
  }
  #[cfg(windows)]
  {
    left.eq_ignore_ascii_case(&right)
  }
  #[cfg(not(windows))]
  {
    left == right
  }
}

fn normalize_trim_range(start: Option<f64>, end: Option<f64>) -> Option<(f64, f64)> {
  let start = start?;
  let end = end?;
  if !start.is_finite() || !end.is_finite() {
    return None;
  }
  let safe_start = start.max(0.0);
  let safe_end = end.max(0.0);
  if safe_end <= safe_start {
    return None;
  }
  Some((safe_start, safe_end))
}

fn push_trim_args(args: &mut Vec<String>, trim: Option<(f64, f64)>) {
  if let Some((start, end)) = trim {
    args.push("-ss".into());
    args.push(format!("{start:.3}"));
    args.push("-to".into());
    args.push(format!("{end:.3}"));
  }
}

// Use accurate seeks for previews to match the paused frame.
fn build_preview_decode_args(
  input_path: &str,
  time_seconds: f64,
  keyframe_seconds: Option<f64>,
  width: u32,
  height: u32,
  output_path: &PathBuf
) -> Vec<String> {
  let target = time_seconds.max(0.0);
  let anchor = keyframe_seconds.filter(|value| value.is_finite() && *value >= 0.0);
  let pre_seek = anchor.filter(|value| *value <= target);
  let post_seek = pre_seek.map_or(target, |value| (target - value).max(0.0));

  let mut args = vec![
    "-y".into(),
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
  ];

  if let Some(value) = pre_seek {
    // Fast seek to the nearest keyframe, then accurately seek within the GOP.
    args.push("-ss".into());
    args.push(format!("{value:.3}"));
  }

  args.extend([
    "-i".into(),
    input_path.into(),
    "-map".into(),
    "0:v:0".into(),
    "-an".into(),
    "-ss".into(),
    format!("{post_seek:.3}"),
    "-frames:v".into(),
    "1".into(),
    "-vf".into(),
    format!("scale={width}:{height},setsar=1,format=rgba"),
    "-f".into(),
    "rawvideo".into(),
    "-pix_fmt".into(),
    "rgba".into(),
    output_path.to_string_lossy().into_owned()
  ]);

  args
}

fn build_preview_encode_args(width: u32, height: u32, output_path: &PathBuf) -> Vec<String> {
  vec![
    "-y".into(),
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-f".into(),
    "rawvideo".into(),
    "-pix_fmt".into(),
    "rgba".into(),
    "-s".into(),
    format!("{width}x{height}"),
    "-i".into(),
    "-".into(),
    "-frames:v".into(),
    "1".into(),
    "-f".into(),
    "image2".into(),
    "-vcodec".into(),
    "png".into(),
    output_path.to_string_lossy().into_owned()
  ]
}

fn build_encode_args(
  width: u32,
  height: u32,
  fps: f64,
  encoding: &PixelsortEncoding,
  output_path: &PathBuf
) -> Vec<String> {
  let mut args = vec![
    "-y".into(),
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-f".into(),
    "rawvideo".into(),
    "-pix_fmt".into(),
    "rgba".into(),
    "-s".into(),
    format!("{width}x{height}"),
    "-r".into(),
    format!("{fps:.3}"),
    "-i".into(),
    "-".into(),
  ];

  if encoding.encoder == "h264_nvenc" {
    let cq = encoding.cq.unwrap_or(19);
    args.extend([
      "-c:v".into(),
      "h264_nvenc".into(),
      "-preset".into(),
      encoding.preset.clone(),
      "-rc".into(),
      "vbr".into(),
      "-cq".into(),
      cq.to_string(),
      "-b:v".into(),
      "0".into()
    ]);
  } else {
    let crf = encoding.crf.unwrap_or(20);
    args.extend([
      "-c:v".into(),
      "libx264".into(),
      "-preset".into(),
      encoding.preset.clone(),
      "-crf".into(),
      crf.to_string()
    ]);
  }

  if let Some(max_bitrate) = encoding.max_bitrate_kbps {
    // Apply a VBV cap to avoid runaway file sizes on high-variance frames.
    let maxrate = max_bitrate.max(1200);
    let bufsize = maxrate.saturating_mul(2);
    args.extend([
      "-maxrate".into(),
      format!("{maxrate}k"),
      "-bufsize".into(),
      format!("{bufsize}k")
    ]);
  }

  args.extend([
    "-pix_fmt".into(),
    "yuv420p".into(),
    "-movflags".into(),
    "+faststart".into(),
    output_path.to_string_lossy().into_owned()
  ]);

  args
}

fn build_decode_args(
  input_path: &str,
  width: u32,
  height: u32,
  trim: Option<(f64, f64)>
) -> Vec<String> {
  let mut args = vec![
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-i".into(),
    input_path.into()
  ];
  push_trim_args(&mut args, trim);
  args.extend([
    "-map".into(),
    "0:v:0".into(),
    "-an".into(),
    "-vf".into(),
    format!("scale={width}:{height},setsar=1"),
    "-f".into(),
    "rawvideo".into(),
    "-pix_fmt".into(),
    "rgba".into(),
    "-".into()
  ]);
  args
}

fn build_mux_args(
  temp_video: &PathBuf,
  input_path: &str,
  output_path: &str,
  trim: Option<(f64, f64)>
) -> Vec<String> {
  let mut args = vec![
    "-y".into(),
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-i".into(),
    temp_video.to_string_lossy().into_owned()
  ];
  push_trim_args(&mut args, trim);
  args.extend([
    "-i".into(),
    input_path.into(),
    "-map".into(),
    "0:v:0".into(),
    "-map".into(),
    "1:a?".into(),
    "-c:v".into(),
    "copy".into(),
    "-c:a".into(),
    "aac".into(),
    "-b:a".into(),
    "192k".into(),
    "-shortest".into(),
    "-movflags".into(),
    "+faststart".into(),
    output_path.into()
  ]);
  args
}

async fn run_ffmpeg_output(app: &AppHandle, args: Vec<String>) -> Result<(), String> {
  let output = resolve_ffmpeg_command(app, "ffmpeg")?
    .args(args)
    .output()
    .await
    .map_err(|error| error.to_string())?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(stderr.trim().to_string());
  }
  Ok(())
}

async fn wait_for_exit(
  mut rx: tauri::async_runtime::Receiver<CommandEvent>
) -> Result<(i32, Vec<String>), String> {
  let mut code = None;
  let mut errors = Vec::new();
  while let Some(event) = rx.recv().await {
    match event {
      CommandEvent::Stderr(line) => {
        let message = String::from_utf8_lossy(&line).trim().to_string();
        if !message.is_empty() {
          errors.push(message);
        }
      }
      CommandEvent::Error(error) => {
        errors.push(format!("error: {error}"));
      }
      CommandEvent::Terminated(payload) => {
        code = payload.code;
      }
      _ => {}
    }
  }
  Ok((code.unwrap_or(-1), errors))
}

async fn decode_preview_frame(
  app: &AppHandle,
  input_path: &str,
  time_seconds: f64,
  keyframe_seconds: Option<f64>,
  width: u32,
  height: u32
) -> Result<Vec<u8>, String> {
  let output_path = build_preview_raw_path("manual");
  let args =
    build_preview_decode_args(input_path, time_seconds, keyframe_seconds, width, height, &output_path);
  let output = resolve_ffmpeg_command(app, "ffmpeg")?
    .args(args)
    .output()
    .await
    .map_err(|error| error.to_string())?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let _ = std::fs::remove_file(&output_path);
    return Err(stderr);
  }
  let buffer = std::fs::read(&output_path)
    .map_err(|error| format!("Preview read failed: {error}"))?;
  let _ = std::fs::remove_file(&output_path);
  let frame_size = (width as usize) * (height as usize) * 4;
  if buffer.len() < frame_size {
    return Err(format!(
      "Preview frame decode size mismatch (expected {frame_size} bytes, got {}).",
      buffer.len()
    ));
  }
  if buffer.len() == frame_size {
    return Ok(buffer);
  }

  let usable = buffer.len() - (buffer.len() % frame_size);
  let start = usable.saturating_sub(frame_size);
  Ok(buffer[start..start + frame_size].to_vec())
}

async fn encode_preview_frame(
  app: &AppHandle,
  frame: &[u8],
  width: u32,
  height: u32,
  output_path: &PathBuf
) -> Result<(), String> {
  let args = build_preview_encode_args(width, height, output_path);
  let encode_cmd = resolve_ffmpeg_command(app, "ffmpeg")?.args(args);
  let (encode_rx, mut encode_child) = encode_cmd
    .spawn()
    .map_err(|error| format!("Failed to spawn preview encoder: {error}"))?;
  encode_child
    .write(frame)
    .map_err(|error| format!("Failed to write preview frame: {error}"))?;
  drop(encode_child);

  let (code, errors) = wait_for_exit(encode_rx).await?;
  if code != 0 {
    let message = errors.join("\n");
    return Err(if message.is_empty() {
      format!("Preview encoder failed with exit code {code}")
    } else {
      message
    });
  }
  Ok(())
}

async fn read_until_terminated(
  mut rx: tauri::async_runtime::Receiver<CommandEvent>,
  log_label: &str,
  window: Window,
  job_id: String
) -> Result<i32, String> {
  let mut code = None;
  while let Some(event) = rx.recv().await {
    match event {
      CommandEvent::Stderr(line) => {
        let message = String::from_utf8_lossy(&line).trim().to_string();
        if !message.is_empty() {
          emit_log(&window, &job_id, format!("{log_label}: {message}"));
        }
      }
      CommandEvent::Error(error) => {
        emit_log(&window, &job_id, format!("{log_label} error: {error}"));
      }
      CommandEvent::Terminated(payload) => {
        code = payload.code;
      }
      _ => {}
    }
  }
  Ok(code.unwrap_or(-1))
}

#[tauri::command]
pub async fn pixelsort_cancel(
  job_id: String,
  state: State<'_, PixelsortJobs>
) -> Result<(), String> {
  if state.cancel(&job_id) {
    Ok(())
  } else {
    Err("Unknown pixelsort job".into())
  }
}

#[tauri::command]
pub async fn pixelsort_preview(
  app: AppHandle,
  input_path: String,
  time_seconds: f64,
  keyframe_seconds: Option<f64>,
  width: u32,
  height: u32,
  config: PixelsortConfig
) -> Result<PixelsortPreviewResponse, String> {
  if input_path.trim().is_empty() {
    return Err("Preview input path is missing.".into());
  }

  if width < 2 || height < 2 {
    return Err("Preview dimensions are invalid.".into());
  }

  let safe_width = if width % 2 == 0 { width } else { width - 1 };
  let safe_height = if height % 2 == 0 { height } else { height - 1 };

  let frame = decode_preview_frame(
    &app,
    &input_path,
    time_seconds,
    keyframe_seconds,
    safe_width,
    safe_height
  )
    .await?;
  let mut workspace = FrameWorkspace::new(safe_width as usize, safe_height as usize);
  let processed = pixelsort_frame(&frame, &mut workspace, &config, 0);
  let (preview_width, preview_height) = resolve_preview_size(safe_width, safe_height);
  let preview_frame = downscale_rgba_nearest(
    processed,
    safe_width,
    safe_height,
    preview_width,
    preview_height
  );

  let preview_path = build_preview_path("manual");
  encode_preview_frame(&app, &preview_frame, preview_width, preview_height, &preview_path)
    .await?;

  Ok(PixelsortPreviewResponse {
    path: preview_path.to_string_lossy().into_owned()
  })
}

#[tauri::command]
pub async fn pixelsort_process(
  window: Window,
  app: AppHandle,
  state: State<'_, PixelsortJobs>,
  job_id: String,
  input_path: String,
  output_path: String,
  width: u32,
  height: u32,
  fps: f64,
  duration_seconds: Option<f64>,
  trim_start_seconds: Option<f64>,
  trim_end_seconds: Option<f64>,
  config: PixelsortConfig,
  preview_enabled: bool,
  encoding: PixelsortEncoding
) -> Result<(), String> {
  if paths_match(&input_path, &output_path) {
    return Err("Output path matches the input file. Choose a different output name.".into());
  }

  let cancel_flag = state.register(&job_id);
  emit_log(&window, &job_id, "Pixel sort started.");

  if width < 2 || height < 2 {
    cleanup_file(&PathBuf::from(&output_path));
    state.finish(&job_id);
    return Err("Invalid video dimensions for pixel sort.".into());
  }

  let safe_width = if width % 2 == 0 { width } else { width - 1 };
  let safe_height = if height % 2 == 0 { height } else { height - 1 };
  if safe_width != width || safe_height != height {
    emit_log(
      &window,
      &job_id,
      format!("Adjusted dimensions to even size: {safe_width}x{safe_height}.")
    );
  }

  let safe_fps = if fps > 0.0 { fps } else { 30.0 };
  if (safe_fps - fps).abs() > f64::EPSILON {
    emit_log(&window, &job_id, format!("Fallback FPS applied: {safe_fps:.3}."));
  }

  let output_path_buf = PathBuf::from(&output_path);
  let temp_video = build_temp_video_path(&output_path);
  let frame_size = (safe_width as usize) * (safe_height as usize) * 4;
  let trim_range = normalize_trim_range(trim_start_seconds, trim_end_seconds);
  let duration_for_progress = trim_range
    .map(|(start, end)| (end - start).max(0.0))
    .or(duration_seconds);
  let total_frames = duration_for_progress
    .filter(|duration| *duration > 0.0 && safe_fps > 0.0)
    .map(|duration| (duration * safe_fps).ceil() as u64);

  let decode_args = build_decode_args(&input_path, safe_width, safe_height, trim_range);
  let encode_args = build_encode_args(
    safe_width,
    safe_height,
    safe_fps,
    &encoding,
    &temp_video
  );

  let decode_cmd = resolve_ffmpeg_command(&app, "ffmpeg")?
    .args(decode_args)
    .set_raw_out(true);
  let encode_cmd = resolve_ffmpeg_command(&app, "ffmpeg")?.args(encode_args);

  let (mut decode_rx, decode_child) = decode_cmd
    .spawn()
    .map_err(|error| format!("Failed to spawn decoder: {error}"))?;
  let (encode_rx, mut encode_child) = encode_cmd
    .spawn()
    .map_err(|error| format!("Failed to spawn encoder: {error}"))?;

  // Accumulate decoder output without per-frame drains.
  let mut buffer: Vec<u8> = Vec::with_capacity(frame_size * 2);
  let mut read_offset = 0usize;
  let mut workspace = FrameWorkspace::new(safe_width as usize, safe_height as usize);
  let mut processed_frames = 0u64;
  let mut decode_exit_code: Option<i32> = None;
  let mut decode_errors: Vec<String> = Vec::new();
  let mut last_progress = Instant::now();
  let start_time = Instant::now();
  let preview_path = preview_enabled.then(|| build_preview_path(&job_id));
  let preview_every = if preview_enabled {
    let interval = (safe_fps / 2.0).round() as u64;
    interval.max(5).min(60)
  } else {
    0
  };
  let preview_inflight = Arc::new(AtomicBool::new(false));
  let mut last_preview_frame = 0u64;
  let encode_window = window.clone();
  let encode_job_id = job_id.clone();
  let encode_rx_task = tauri::async_runtime::spawn(read_until_terminated(
    encode_rx,
    "encode",
    encode_window,
    encode_job_id
  ));
  let emit_progress_update = |frame: u64| {
    let elapsed_seconds = start_time.elapsed().as_secs_f64();
    let processing_fps = if elapsed_seconds > 0.0 {
      frame as f64 / elapsed_seconds
    } else {
      0.0
    };
    let fps_value = if processing_fps > 0.0 {
      Some(processing_fps)
    } else {
      None
    };
    let speed_value = if safe_fps > 0.0 && processing_fps > 0.0 {
      Some(processing_fps / safe_fps)
    } else {
      None
    };
    let out_time_seconds = if safe_fps > 0.0 {
      Some(frame as f64 / safe_fps)
    } else {
      None
    };
    let eta_seconds = total_frames.and_then(|total| {
      if processing_fps > 0.0 {
        Some(total.saturating_sub(frame) as f64 / processing_fps)
      } else {
        None
      }
    });

    emit_progress(
      &window,
      &job_id,
      frame,
      total_frames,
      fps_value,
      speed_value,
      out_time_seconds,
      Some(elapsed_seconds),
      eta_seconds
    );
  };

  while let Some(event) = decode_rx.recv().await {
    if cancel_flag.load(Ordering::Relaxed) {
      emit_log(&window, &job_id, "Pixel sort canceled.");
      let _ = decode_child.kill();
      let _ = encode_child.kill();
      cleanup_file(&temp_video);
      cleanup_file(&output_path_buf);
      if let Some(preview_path) = preview_path.as_ref() {
        cleanup_file(preview_path);
      }
      state.finish(&job_id);
      return Err("Canceled".into());
    }

    match event {
      CommandEvent::Stdout(bytes) => {
        buffer.extend(bytes);
        while buffer.len().saturating_sub(read_offset) >= frame_size {
          let end = read_offset + frame_size;
          let frame = &buffer[read_offset..end];
          read_offset = end;
          let processed = pixelsort_frame(frame, &mut workspace, &config, processed_frames);
          encode_child
            .write(&processed)
            .map_err(|error| format!("Failed to write frame: {error}"))?;
          processed_frames += 1;

          // Periodically compact the buffer to keep memory bounded.
          if read_offset >= frame_size * 4 {
            buffer.copy_within(read_offset.., 0);
            buffer.truncate(buffer.len().saturating_sub(read_offset));
            read_offset = 0;
          } else if read_offset == buffer.len() {
            buffer.clear();
            read_offset = 0;
          }

          if let Some(preview_path) = preview_path.as_ref() {
            if preview_every > 0
              && processed_frames.saturating_sub(last_preview_frame) >= preview_every
              && !preview_inflight.load(Ordering::Relaxed)
            {
              last_preview_frame = processed_frames;
              preview_inflight.store(true, Ordering::Relaxed);
              let (preview_width, preview_height) =
                resolve_preview_size(safe_width, safe_height);
              let preview_frame = downscale_rgba_nearest(
                processed,
                safe_width,
                safe_height,
                preview_width,
                preview_height
              );
              let preview_path = preview_path.clone();
              let preview_window = window.clone();
              let preview_job_id = job_id.clone();
              let preview_app = app.clone();
              let preview_inflight = preview_inflight.clone();
              let preview_frame_index = processed_frames;
              tauri::async_runtime::spawn(async move {
                let result = encode_preview_frame(
                  &preview_app,
                  &preview_frame,
                  preview_width,
                  preview_height,
                  &preview_path
                )
                .await;
                preview_inflight.store(false, Ordering::Relaxed);
                if result.is_ok() {
                  emit_preview(&preview_window, &preview_job_id, preview_frame_index, &preview_path);
                }
              });
            }
          }

          if last_progress.elapsed() > Duration::from_millis(200) {
            emit_progress_update(processed_frames);
            last_progress = Instant::now();
          }
        }
      }
      CommandEvent::Stderr(line) => {
        let message = String::from_utf8_lossy(&line).trim().to_string();
        if !message.is_empty() {
          decode_errors.push(message.clone());
          emit_log(&window, &job_id, format!("decode: {message}"));
        }
      }
      CommandEvent::Error(error) => {
        decode_errors.push(format!("decode error: {error}"));
        emit_log(&window, &job_id, format!("decode error: {error}"));
      }
      CommandEvent::Terminated(payload) => {
        decode_exit_code = payload.code;
        break;
      }
      _ => {}
    }
  }

  if decode_exit_code.unwrap_or(-1) != 0 {
    let message = if decode_errors.is_empty() {
      format!(
        "Decoder failed with exit code {}",
        decode_exit_code.unwrap_or(-1)
      )
    } else {
      decode_errors.join("\n")
    };
    let _ = encode_child.kill();
    let _ = encode_rx_task.await;
    cleanup_file(&temp_video);
    cleanup_file(&output_path_buf);
    if let Some(preview_path) = preview_path.as_ref() {
      cleanup_file(preview_path);
    }
    state.finish(&job_id);
    return Err(message);
  }

  emit_progress_update(processed_frames);
  drop(encode_child);

  let encode_status = encode_rx_task
    .await
    .map_err(|error| format!("encode task join failed: {error}"))?
    .map_err(|error| format!("encode failed: {error}"))?;
  if encode_status != 0 {
    cleanup_file(&temp_video);
    cleanup_file(&output_path_buf);
    if let Some(preview_path) = preview_path.as_ref() {
      cleanup_file(preview_path);
    }
    state.finish(&job_id);
    return Err(format!("Encoder failed with exit code {encode_status}"));
  }

  if let Err(error) = run_ffmpeg_output(
    &app,
    build_mux_args(&temp_video, &input_path, &output_path, trim_range)
  )
  .await
  {
    cleanup_file(&temp_video);
    cleanup_file(&output_path_buf);
    if let Some(preview_path) = preview_path.as_ref() {
      cleanup_file(preview_path);
    }
    state.finish(&job_id);
    return Err(error);
  }
  cleanup_file(&temp_video);
  if let Some(preview_path) = preview_path.as_ref() {
    cleanup_file(preview_path);
  }

  emit_log(&window, &job_id, "Pixel sort completed.");
  state.finish(&job_id);
  Ok(())
}
