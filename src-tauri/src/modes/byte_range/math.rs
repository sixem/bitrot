// Pixel math + per-frame processing for the modulo mapping effect.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuloMappingConfig {
  pub modulus: u32,
  pub stride: u32,
  pub offset: u32,
  pub intensity: f32
}

fn blend_channel(a: u8, b: u8, mix: f32) -> u8 {
  let inv = 1.0 - mix;
  ((a as f32 * inv) + (b as f32 * mix)).round().clamp(0.0, 255.0) as u8
}

fn quantize_offset(value: i32, step: i32) -> i32 {
  if step <= 1 {
    return value;
  }
  (value / step) * step
}

fn luma_from_rgba(frame: &[u8], idx: usize) -> f32 {
  let r = frame[idx] as f32;
  let g = frame[idx + 1] as f32;
  let b = frame[idx + 2] as f32;
  (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
}

fn boost_saturation(r: u8, g: u8, b: u8, amount: f32) -> (u8, u8, u8) {
  if amount <= 0.0 {
    return (r, g, b);
  }
  let luma = (0.2126 * r as f32) + (0.7152 * g as f32) + (0.0722 * b as f32);
  let boost = 1.0 + amount * 1.6;
  let r = (luma + (r as f32 - luma) * boost).round().clamp(0.0, 255.0) as u8;
  let g = (luma + (g as f32 - luma) * boost).round().clamp(0.0, 255.0) as u8;
  let b = (luma + (b as f32 - luma) * boost).round().clamp(0.0, 255.0) as u8;
  (r, g, b)
}

// Estimate motion/texture activity per block to gate the displacement.
fn block_activity(
  frame: &[u8],
  prev_frame: Option<&[u8]>,
  width: usize,
  height: usize,
  block_x: usize,
  block_y: usize,
  block_w: usize,
  block_h: usize
) -> f32 {
  let sample_step_x = (block_w / 3).max(1);
  let sample_step_y = (block_h / 3).max(1);
  let mut min_luma = 255.0f32;
  let mut max_luma = 0.0f32;
  let mut diff_sum = 0.0f32;
  let mut count = 0u32;

  for sy in (0..block_h).step_by(sample_step_y) {
    for sx in (0..block_w).step_by(sample_step_x) {
      let x = (block_x + sx).min(width.saturating_sub(1));
      let y = (block_y + sy).min(height.saturating_sub(1));
      let idx = (y * width + x) * 4;
      let luma = luma_from_rgba(frame, idx);
      min_luma = min_luma.min(luma);
      max_luma = max_luma.max(luma);
      if let Some(prev) = prev_frame {
        let prev_luma = luma_from_rgba(prev, idx);
        diff_sum += (luma - prev_luma).abs();
      }
      count += 1;
    }
  }

  if count == 0 {
    return 0.0;
  }

  let contrast = ((max_luma - min_luma) / 255.0).clamp(0.0, 1.0);
  let motion = if prev_frame.is_some() {
    let avg_diff = diff_sum / count as f32;
    (avg_diff / 40.0).clamp(0.0, 1.0)
  } else {
    0.0
  };

  let activity = contrast.max(motion);
  (activity * 1.15).min(1.0).powf(0.7)
}

// Deterministic flow field to keep offsets coherent across blocks.
fn flow_field(
  block_x: usize,
  block_y: usize,
  width: usize,
  height: usize,
  frame_index: u64
) -> (f32, f32) {
  let w = width.max(1) as f32;
  let h = height.max(1) as f32;
  let nx = (block_x as f32 / w) * 2.0 - 1.0;
  let ny = (block_y as f32 / h) * 2.0 - 1.0;
  let t = frame_index as f32 * 0.12;
  let wave_x = (nx * 3.4 + t).sin() + (ny * 2.2 - t * 0.7).cos();
  let wave_y = (ny * 3.1 - t * 0.6).sin() - (nx * 2.6 + t * 0.4).cos();
  let fx = (wave_x * 0.5).clamp(-1.0, 1.0);
  let fy = (wave_y * 0.5).clamp(-1.0, 1.0);
  (fx, fy)
}

// Reusable buffers for per-frame processing to avoid extra allocations.
pub(crate) struct ModuloMappingWorkspace {
  width: usize,
  height: usize,
  output: Vec<u8>,
  scratch: Vec<u8>,
  prev_frame: Vec<u8>,
  has_prev: bool
}

impl ModuloMappingWorkspace {
  pub(crate) fn new(width: usize, height: usize) -> Self {
    let byte_len = width.saturating_mul(height).saturating_mul(4);
    Self {
      width,
      height,
      output: vec![0u8; byte_len],
      scratch: vec![0u8; byte_len],
      prev_frame: vec![0u8; byte_len],
      has_prev: false
    }
  }

  pub(crate) fn ensure_size(&mut self, width: usize, height: usize) {
    let byte_len = width.saturating_mul(height).saturating_mul(4);
    if self.width != width || self.height != height || self.output.len() != byte_len {
      self.width = width;
      self.height = height;
      self.output.resize(byte_len, 0);
      self.scratch.resize(byte_len, 0);
      self.prev_frame.resize(byte_len, 0);
      self.has_prev = false;
    }
  }

  pub(crate) fn update_prev(&mut self, frame: &[u8]) {
    if self.prev_frame.len() == frame.len() {
      self.prev_frame.copy_from_slice(frame);
      self.has_prev = true;
    }
  }
}

fn restore_alpha(output: &mut [u8], source: &[u8]) {
  for index in (3..output.len()).step_by(4) {
    output[index] = source[index];
  }
}

pub(crate) fn process_modulo_mapping_frame<'a>(
  frame: &[u8],
  workspace: &'a mut ModuloMappingWorkspace,
  config: &ModuloMappingConfig,
  frame_index: u64,
  width: usize,
  height: usize
) -> &'a [u8] {
  let byte_len = width.saturating_mul(height).saturating_mul(4);
  workspace.ensure_size(width, height);
  if byte_len == 0 || frame.len() < byte_len {
    return &workspace.output;
  }
  let frame_slice = &frame[..byte_len];
  workspace.output.copy_from_slice(frame_slice);
  workspace.scratch.copy_from_slice(frame_slice);

  if width == 0 || height == 0 {
    return &workspace.output;
  }

  let block_size = config.modulus.max(2) as usize;
  let stride = config.stride.max(1) as i32;
  let max_offset = config.offset as f32;
  let mix = (config.intensity / 100.0).clamp(0.0, 1.0);
  if mix <= 0.0 || max_offset <= 0.0 {
    workspace.update_prev(frame_slice);
    return &workspace.output;
  }

  // Use the previous frame as motion context when available.
  let prev_frame = workspace.has_prev.then(|| workspace.prev_frame.as_slice());

  // Walk each block and apply a coherent offset + saturation boost.
  for by in (0..height).step_by(block_size) {
    let block_h = (height - by).min(block_size);
    for bx in (0..width).step_by(block_size) {
      let block_w = (width - bx).min(block_size);
      if block_w < 1 || block_h < 1 {
        continue;
      }

      let activity = block_activity(
        &workspace.scratch,
        prev_frame,
        width,
        height,
        bx,
        by,
        block_w,
        block_h
      );
      let energy = activity * activity;
      let (mut field_x, mut field_y) =
        flow_field(bx + block_w / 2, by + block_h / 2, width, height, frame_index);
      let warp = (activity - 0.5) * 0.6;
      field_x = (field_x + warp).clamp(-1.0, 1.0);
      field_y = (field_y - warp).clamp(-1.0, 1.0);

      let offset_scale = 0.35 + energy * 0.65;
      let dx = quantize_offset(
        (field_x * max_offset * offset_scale).round() as i32,
        stride
      );
      let dy = quantize_offset(
        (field_y * max_offset * offset_scale).round() as i32,
        stride
      );

      let block_mix = mix * (0.35 + energy * 0.65);
      let is_full_strength = block_mix >= 0.999;
      let color_boost = (0.25 + energy * 0.75) * mix;
      let block_w_i = block_w as i32;
      let block_h_i = block_h as i32;

      for y in 0..block_h {
        let dst_y = by + y;
        for x in 0..block_w {
          let dst_x = bx + x;
          let rel_x = x as i32;
          let rel_y = y as i32;
          let src_rel_x = (rel_x + dx).rem_euclid(block_w_i);
          let src_rel_y = (rel_y + dy).rem_euclid(block_h_i);
          let src_x = bx + src_rel_x as usize;
          let src_y = by + src_rel_y as usize;
          let src_idx = (src_y * width + src_x) * 4;
          let dst_idx = (dst_y * width + dst_x) * 4;

          if is_full_strength {
            workspace.output[dst_idx..dst_idx + 3]
              .copy_from_slice(&workspace.scratch[src_idx..src_idx + 3]);
          } else {
            for channel in 0..3 {
              let base = workspace.scratch[dst_idx + channel];
              let mapped = workspace.scratch[src_idx + channel];
              workspace.output[dst_idx + channel] =
                blend_channel(base, mapped, block_mix);
            }
          }

          let (r, g, b) = boost_saturation(
            workspace.output[dst_idx],
            workspace.output[dst_idx + 1],
            workspace.output[dst_idx + 2],
            color_boost
          );
          workspace.output[dst_idx] = r;
          workspace.output[dst_idx + 1] = g;
          workspace.output[dst_idx + 2] = b;
        }
      }
    }
  }

  restore_alpha(&mut workspace.output, &workspace.scratch);
  workspace.update_prev(frame_slice);
  &workspace.output
}
