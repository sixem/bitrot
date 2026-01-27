// Bitstream-level I-frame removal for MPEG-4 Part 2 (m4v) datamosh output.
use serde::Deserialize;
use std::fs;
use std::io::Write;

#[derive(Clone, Copy, Deserialize)]
pub struct SceneWindow {
  pub start: f64,
  pub end: f64,
}

struct NalUnit {
  start: usize,
  end: usize,
  is_vop: bool,
  is_intra_vop: bool,
}

struct LcgRng {
  state: u64,
}

impl LcgRng {
  fn new(seed: u64) -> Self {
    Self { state: seed }
  }

  fn next_f64(&mut self) -> f64 {
    // Simple deterministic generator (not cryptographically secure).
    self.state = self
      .state
      .wrapping_mul(1664525)
      .wrapping_add(1013904223);
    let value = ((self.state >> 8) & 0xFFFFFF) as f64 / 0xFFFFFF as f64;
    value
  }
}

struct BitReader<'a> {
  data: &'a [u8],
  bit_index: usize,
}

impl<'a> BitReader<'a> {
  fn new(data: &'a [u8]) -> Self {
    Self { data, bit_index: 0 }
  }

  fn read_bit(&mut self) -> Option<u8> {
    let byte_index = self.bit_index / 8;
    if byte_index >= self.data.len() {
      return None;
    }
    let bit_in_byte = 7 - (self.bit_index % 8);
    let value = (self.data[byte_index] >> bit_in_byte) & 1;
    self.bit_index += 1;
    Some(value)
  }

  fn read_bits(&mut self, count: usize) -> Option<u32> {
    let mut value = 0u32;
    for _ in 0..count {
      value = (value << 1) | u32::from(self.read_bit()?);
    }
    Some(value)
  }
}

fn find_start_codes(data: &[u8]) -> Vec<(usize, u8)> {
  let mut positions = Vec::new();
  let mut i = 0usize;

  while i + 3 < data.len() {
    if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
      let code = data[i + 3];
      positions.push((i, code));
      i += 3;
      continue;
    }
    i += 1;
  }

  positions
}

fn parse_vop_type(payload: &[u8]) -> Option<u8> {
  if payload.is_empty() {
    return None;
  }
  let mut reader = BitReader::new(payload);
  let vop_type = reader.read_bits(2)?;
  Some(vop_type as u8)
}

fn parse_nal_units(data: &[u8]) -> Vec<NalUnit> {
  let start_codes = find_start_codes(data);
  if start_codes.is_empty() {
    return Vec::new();
  }

  let mut units = Vec::new();
  for (idx, (start, code)) in start_codes.iter().enumerate() {
    let end = if idx + 1 < start_codes.len() {
      start_codes[idx + 1].0
    } else {
      data.len()
    };
    let payload_start = start + 4;
    let payload = if payload_start < end {
      &data[payload_start..end]
    } else {
      &[]
    };
    let is_vop = *code == 0xB6;
    let vop_type = if is_vop {
      parse_vop_type(payload)
    } else {
      None
    };
    let is_intra_vop = is_vop && vop_type == Some(0);

    units.push(NalUnit {
      start: *start,
      end,
      is_vop,
      is_intra_vop,
    });
  }

  units
}

fn parse_extradata_hex(extradata_hex: Option<&str>) -> Vec<u8> {
  let Some(raw) = extradata_hex else {
    return Vec::new();
  };
  let filtered: String = raw.chars().filter(|ch| ch.is_ascii_hexdigit()).collect();
  if filtered.len() < 2 || filtered.len() % 2 != 0 {
    return Vec::new();
  }

  let mut bytes = Vec::with_capacity(filtered.len() / 2);
  let mut i = 0usize;
  while i + 1 < filtered.len() {
    let pair = &filtered[i..i + 2];
    if let Ok(value) = u8::from_str_radix(pair, 16) {
      bytes.push(value);
    }
    i += 2;
  }
  bytes
}

fn ensure_start_code_prefix(bytes: &[u8]) -> Vec<u8> {
  if bytes.len() >= 4 && bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 1 {
    return bytes.to_vec();
  }
  let mut out = Vec::with_capacity(bytes.len() + 3);
  out.extend_from_slice(&[0, 0, 1]);
  out.extend_from_slice(bytes);
  out
}

fn window_index(time: f64, windows: &[SceneWindow]) -> Option<usize> {
  windows
    .iter()
    .position(|window| time >= window.start && time <= window.end)
}

pub fn process_datamosh(
  input_path: &str,
  output_path: &str,
  fps: f64,
  windows: &[SceneWindow],
  intensity: f64,
  seed: u64,
  extradata_hex: Option<&str>,
) -> Result<(), String> {
  let data = fs::read(input_path)
    .map_err(|err| format!("Failed to read bitstream: {err}"))?;
  let units = parse_nal_units(&data);
  if units.is_empty() {
    return Err("No MPEG-4 start codes found in bitstream".into());
  }

  let extradata_bytes = parse_extradata_hex(extradata_hex);
  let extradata_prefix = if extradata_bytes.is_empty() {
    Vec::new()
  } else {
    ensure_start_code_prefix(&extradata_bytes)
  };

  let first_vop_index = units
    .iter()
    .position(|unit| unit.is_vop)
    .ok_or_else(|| "No VOP frames found in MPEG-4 bitstream".to_string())?;

  let drop_probability = (intensity / 100.0).clamp(0.0, 1.0);
  let mut rng = LcgRng::new(seed.max(1));
  // A valid stream needs at least one intra reference frame to decode.
  let mut has_reference_intra_vop = false;
  let mut vop_index = 0usize;
  // Once a window starts dropping intra frames, keep dropping them to sustain smear.
  let mut window_drop_started = vec![false; windows.len()];
  let mut output = fs::File::create(output_path)
    .map_err(|err| format!("Failed to create output bitstream: {err}"))?;

  if !extradata_prefix.is_empty() {
    output
      .write_all(&extradata_prefix)
      .map_err(|err| format!("Failed to write extradata prefix: {err}"))?;
  }

  // Always prepend the leading header units so ffmpeg can read codec params.
  for unit in &units[..first_vop_index] {
    output
      .write_all(&data[unit.start..unit.end])
      .map_err(|err| format!("Failed to write header units: {err}"))?;
  }

  for (index, unit) in units.iter().enumerate() {
    if index < first_vop_index {
      continue;
    }
    if !unit.is_vop {
      // Keep headers and non-frame units so the stream stays decodable.
      output
        .write_all(&data[unit.start..unit.end])
        .map_err(|err| format!("Failed to write output bitstream: {err}"))?;
      continue;
    }

    if unit.is_intra_vop && !has_reference_intra_vop {
      output
        .write_all(&data[unit.start..unit.end])
        .map_err(|err| format!("Failed to write first intra frame: {err}"))?;
      has_reference_intra_vop = true;
      vop_index += 1;
      continue;
    }

    let time = vop_index as f64 / fps.max(1.0);
    let active_window = window_index(time, windows);
    let in_window = active_window.is_some();
    let mut should_drop = unit.is_intra_vop && in_window && drop_probability > 0.0;

    if should_drop {
      let window_idx = active_window.unwrap_or(0);
      if window_drop_started.get(window_idx).copied().unwrap_or(false) {
        should_drop = true;
      } else {
        let roll = rng.next_f64();
        if roll >= drop_probability {
          should_drop = false;
        } else if let Some(state) = window_drop_started.get_mut(window_idx) {
          *state = true;
        }
      }
    }

    if !should_drop {
      output
        .write_all(&data[unit.start..unit.end])
        .map_err(|err| format!("Failed to write output bitstream: {err}"))?;
    }

    vop_index += 1;
  }

  Ok(())
}
