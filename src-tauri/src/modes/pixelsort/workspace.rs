// Workspace buffers and low-level pixel helpers for the pixelsort pipeline.
// Keeping these in a dedicated module lets the job code focus on control flow.

// Use standard luma weights to preserve perceptual brightness.
pub(crate) fn luma(r: u8, g: u8, b: u8) -> u8 {
  let value = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;
  value.round().clamp(0.0, 255.0) as u8
}

pub(crate) fn blend_channel(a: u8, b: u8, mix: f32) -> u8 {
  let inv = 1.0 - mix;
  ((a as f32 * inv) + (b as f32 * mix))
    .round()
    .clamp(0.0, 255.0) as u8
}

pub(crate) fn clamp_u8(value: i32) -> u8 {
  value.clamp(0, 255) as u8
}

// Reusable buffers for per-frame processing to avoid extra allocations.
pub(crate) struct FrameWorkspace {
  pub(crate) width: usize,
  pub(crate) height: usize,
  pub(crate) pixel_count: usize,
  pub(crate) output: Vec<u8>,
  pub(crate) luma: Vec<u8>,
  pub(crate) scratch: Vec<u8>,
  pub(crate) segment_indices: Vec<usize>,
  pub(crate) luma_counts: [usize; 256],
  pub(crate) luma_offsets: [usize; 256]
}

impl FrameWorkspace {
  pub(crate) fn new(width: usize, height: usize) -> Self {
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
  pub(crate) fn prepare(&mut self, input: &[u8]) {
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

  pub(crate) fn output(&self) -> &[u8] {
    &self.output
  }
}
