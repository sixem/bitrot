// Core pixelsort algorithm and post-processing stack.
// This module only works on in-memory RGBA frames to keep it reusable.

use serde::Deserialize;

use super::workspace::{blend_channel, clamp_u8, luma, FrameWorkspace};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelsortConfig {
  pub intensity: f32,
  pub threshold: f32,
  pub max_threshold: f32,
  pub block_size: u32,
  pub direction: String
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

fn in_luma_band(value: u8, min: u8, max: u8) -> bool {
  value >= min && value <= max
}

// Clamp and normalize thresholds so the UI can send them in any order.
fn resolve_luma_band(mut min_threshold: i32, mut max_threshold: i32) -> (u8, u8) {
  min_threshold = min_threshold.clamp(0, 255);
  max_threshold = max_threshold.clamp(0, 255);
  if min_threshold > max_threshold {
    std::mem::swap(&mut min_threshold, &mut max_threshold);
  }
  (min_threshold as u8, max_threshold as u8)
}

// Ensures the segment buffer can hold the largest segment we might sort.
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

fn fill_segment_bytes(input: &[u8], segment_indices: &[usize], segment_bytes: &mut [u8]) {
  for (offset, source_pixel) in segment_indices.iter().enumerate() {
    let s_idx = source_pixel * 4;
    let d_idx = offset * 4;
    segment_bytes[d_idx] = input[s_idx];
    segment_bytes[d_idx + 1] = input[s_idx + 1];
    segment_bytes[d_idx + 2] = input[s_idx + 2];
    segment_bytes[d_idx + 3] = input[s_idx + 3];
  }
}

fn blend_segment_bytes(
  output: &mut [u8],
  dest_start: usize,
  dest_stride: usize,
  segment_bytes: &[u8],
  segment_len: usize,
  is_full_strength: bool,
  strength: f32
) {
  let byte_len = segment_len * 4;
  if is_full_strength && dest_stride == 4 {
    output[dest_start..dest_start + byte_len].copy_from_slice(&segment_bytes[..byte_len]);
    return;
  }

  if is_full_strength {
    let mut dst_idx = dest_start;
    for offset in 0..segment_len {
      let src_idx = offset * 4;
      output[dst_idx..dst_idx + 4].copy_from_slice(&segment_bytes[src_idx..src_idx + 4]);
      dst_idx += dest_stride;
    }
    return;
  }

  let mut dst_idx = dest_start;
  for offset in 0..segment_len {
    let src_idx = offset * 4;
    output[dst_idx] = blend_channel(output[dst_idx], segment_bytes[src_idx], strength);
    output[dst_idx + 1] =
      blend_channel(output[dst_idx + 1], segment_bytes[src_idx + 1], strength);
    output[dst_idx + 2] =
      blend_channel(output[dst_idx + 2], segment_bytes[src_idx + 2], strength);
    output[dst_idx + 3] = segment_bytes[src_idx + 3];
    dst_idx += dest_stride;
  }
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
  strength: f32,
  is_full_strength: bool
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
          fill_segment_bytes(input, segment_indices, segment_bytes);
          let dest_start = row_start * 4 + start * 4;
          blend_segment_bytes(
            output,
            dest_start,
            4,
            segment_bytes,
            segment_len,
            is_full_strength,
            strength
          );
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
  strength: f32,
  is_full_strength: bool
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
          fill_segment_bytes(input, segment_indices, segment_bytes);
          let dest_start = (start * width + x) * 4;
          blend_segment_bytes(
            output,
            dest_start,
            width * 4,
            segment_bytes,
            segment_len,
            is_full_strength,
            strength
          );
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
  strength: f32,
  is_full_strength: bool
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
        let segment_len = sort_block_by_luma(
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
        let byte_len = segment_len * 4;
        let segment_bytes = &mut scratch[..byte_len];
        fill_segment_bytes(input, segment_indices, segment_bytes);

        let mut offset = 0usize;
        if is_full_strength {
          for y in by..end_y {
            for x in bx..end_x {
              let dst_idx = (y * width + x) * 4;
              let src_idx = offset * 4;
              output[dst_idx..dst_idx + 4]
                .copy_from_slice(&segment_bytes[src_idx..src_idx + 4]);
              offset += 1;
            }
          }
        } else {
          for y in by..end_y {
            for x in bx..end_x {
              let dst_idx = (y * width + x) * 4;
              let src_idx = offset * 4;
              output[dst_idx] = blend_channel(output[dst_idx], segment_bytes[src_idx], strength);
              output[dst_idx + 1] =
                blend_channel(output[dst_idx + 1], segment_bytes[src_idx + 1], strength);
              output[dst_idx + 2] =
                blend_channel(output[dst_idx + 2], segment_bytes[src_idx + 2], strength);
              output[dst_idx + 3] = segment_bytes[src_idx + 3];
              offset += 1;
            }
          }
        }
      }

      bx += block_size;
    }
    by += block_size;
  }
}

// Processes a single frame in-place using cached buffers for speed.
pub(crate) fn pixelsort_frame<'a>(
  input: &[u8],
  workspace: &'a mut FrameWorkspace,
  config: &PixelsortConfig,
  frame_index: u64
) -> &'a [u8] {
  workspace.prepare(input);
  // Intensity is the blend strength between original and sorted pixels.
  let strength = (config.intensity / 100.0).clamp(0.0, 1.0);
  let is_full_strength = strength >= 0.999;
  let block_size = (config.block_size.max(2)) as usize;
  // Ignore single-pixel runs so tiny noise doesn't get sorted.
  let min_segment = 2;
  let min_threshold = config.threshold.round() as i32;
  let max_threshold = config.max_threshold.round() as i32;
  // Luma band gates which pixels/blocks are eligible for sorting.
  let (min_threshold, max_threshold) = resolve_luma_band(min_threshold, max_threshold);

  let width = workspace.width;
  let height = workspace.height;
  let block_capacity = block_size.saturating_mul(block_size);
  ensure_segment_capacity(
    &mut workspace.segment_indices,
    width.max(height).max(block_capacity)
  );

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
        strength,
        is_full_strength
      ),
      SortDirection::Vertical => pixelsort_vertical(
        input,
        workspace,
        width,
        height,
        min_threshold,
        max_threshold,
        min_segment,
        strength,
        is_full_strength
      ),
      SortDirection::Block => pixelsort_block(
        input,
        workspace,
        width,
        height,
        min_threshold,
        max_threshold,
        block_size,
        strength,
        is_full_strength
      )
    }
  }

  apply_pixelsort_fx(workspace, frame_index);

  workspace.output()
}

// Applies a lightweight post-processing stack for the classic pixel-sort look.
fn apply_pixelsort_fx(workspace: &mut FrameWorkspace, frame_index: u64) {
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
