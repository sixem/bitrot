// Bitstream-level I-frame removal for MPEG-4 Part 2 (m4v) datamosh output.
use serde::Deserialize;
use std::fs::File;
use std::io::{BufReader, Read, Write};

#[derive(Clone, Copy, Deserialize)]
pub struct SceneWindow {
  pub start: f64,
  pub end: f64,
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

fn parse_vop_type(payload: &[u8]) -> Option<u8> {
  if payload.is_empty() {
    return None;
  }
  let mut reader = BitReader::new(payload);
  let vop_type = reader.read_bits(2)?;
  Some(vop_type as u8)
}

fn find_start_code(data: &[u8], from: usize) -> Option<usize> {
  if data.len() < 3 || from >= data.len().saturating_sub(2) {
    return None;
  }
  for idx in from..=(data.len() - 3) {
    if data[idx] == 0 && data[idx + 1] == 0 && data[idx + 2] == 1 {
      return Some(idx);
    }
  }
  None
}

// Stream MPEG-4 start-code-delimited units without loading the full file.
struct StartCodeReader<R: Read> {
  reader: BufReader<R>,
  buffer: Vec<u8>,
  eof: bool,
  aligned: bool,
}

impl<R: Read> StartCodeReader<R> {
  fn new(reader: R) -> Self {
    Self {
      reader: BufReader::new(reader),
      buffer: Vec::new(),
      eof: false,
      aligned: false,
    }
  }

  fn next_unit(&mut self) -> Result<Option<Vec<u8>>, String> {
    const CHUNK_SIZE: usize = 64 * 1024;
    loop {
      if let Some(unit) = self.try_split_unit()? {
        return Ok(Some(unit));
      }

      if self.eof {
        return Ok(None);
      }

      let mut chunk = vec![0u8; CHUNK_SIZE];
      let read = self
        .reader
        .read(&mut chunk)
        .map_err(|err| format!("Failed to read bitstream: {err}"))?;
      if read == 0 {
        self.eof = true;
      } else {
        self.buffer.extend_from_slice(&chunk[..read]);
      }
    }
  }

  fn try_split_unit(&mut self) -> Result<Option<Vec<u8>>, String> {
    if !self.aligned {
      if let Some(start) = find_start_code(&self.buffer, 0) {
        if start > 0 {
          // Discard leading bytes until the first start code.
          self.buffer = self.buffer.split_off(start);
        }
        self.aligned = true;
      } else {
        // Keep a tiny tail so we can detect a start code across chunk boundaries.
        self.keep_tail_bytes(2);
        return Ok(None);
      }
    }

    if self.buffer.len() < 4 {
      if self.eof && !self.buffer.is_empty() {
        return Err("Truncated MPEG-4 start code at end of file.".into());
      }
      return Ok(None);
    }

    if let Some(next_start) = find_start_code(&self.buffer, 4) {
      // Split off a full unit from the current start code up to the next one.
      let remaining = self.buffer.split_off(next_start);
      let unit = std::mem::replace(&mut self.buffer, remaining);
      return Ok(Some(unit));
    }

    if self.eof {
      let unit = std::mem::take(&mut self.buffer);
      return Ok(Some(unit));
    }

    Ok(None)
  }

  fn keep_tail_bytes(&mut self, count: usize) {
    if self.buffer.len() <= count {
      return;
    }
    let tail = self.buffer.split_off(self.buffer.len() - count);
    self.buffer = tail;
  }
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

// Window scans assume windows are sorted by start time (as produced in the JS pipeline).
fn window_index(time: f64, windows: &[SceneWindow], cursor: &mut usize) -> Option<usize> {
  if windows.is_empty() {
    return None;
  }
  let mut index = (*cursor).min(windows.len());
  while index < windows.len() && time > windows[index].end {
    index += 1;
  }
  *cursor = index;
  if index >= windows.len() {
    return None;
  }
  let window = &windows[index];
  if time >= window.start && time <= window.end {
    Some(index)
  } else {
    None
  }
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
  let extradata_bytes = parse_extradata_hex(extradata_hex);
  let extradata_prefix = if extradata_bytes.is_empty() {
    Vec::new()
  } else {
    ensure_start_code_prefix(&extradata_bytes)
  };

  let drop_probability = (intensity / 100.0).clamp(0.0, 1.0);
  let mut rng = LcgRng::new(seed.max(1));
  // A valid stream needs at least one intra reference frame to decode.
  let mut has_reference_intra_vop = false;
  let mut vop_index = 0usize;
  let mut has_units = false;
  let mut has_vop = false;
  // Once a window starts dropping intra frames, keep dropping them to sustain smear.
  let mut window_drop_started = vec![false; windows.len()];
  let mut window_cursor = 0usize;
  let input = File::open(input_path)
    .map_err(|err| format!("Failed to open bitstream: {err}"))?;
  let mut reader = StartCodeReader::new(input);
  let mut output = File::create(output_path)
    .map_err(|err| format!("Failed to create output bitstream: {err}"))?;

  if !extradata_prefix.is_empty() {
    output
      .write_all(&extradata_prefix)
      .map_err(|err| format!("Failed to write extradata prefix: {err}"))?;
  }

  loop {
    let Some(unit) = reader.next_unit()? else { break };
    has_units = true;
    if unit.len() < 4 {
      continue;
    }
    let code = unit[3];
    let is_vop = code == 0xB6;
    let payload = if unit.len() > 4 { &unit[4..] } else { &[] };
    let vop_type = if is_vop { parse_vop_type(payload) } else { None };
    let is_intra_vop = is_vop && vop_type == Some(0);

    if !has_vop && !is_vop {
      // Always prepend the leading header units so ffmpeg can read codec params.
      output
        .write_all(&unit)
        .map_err(|err| format!("Failed to write header units: {err}"))?;
      continue;
    }

    if is_vop {
      has_vop = true;
    } else {
      // Keep headers and non-frame units so the stream stays decodable.
      output
        .write_all(&unit)
        .map_err(|err| format!("Failed to write output bitstream: {err}"))?;
      continue;
    }

    if is_intra_vop && !has_reference_intra_vop {
      output
        .write_all(&unit)
        .map_err(|err| format!("Failed to write first intra frame: {err}"))?;
      has_reference_intra_vop = true;
      vop_index += 1;
      continue;
    }

    let time = vop_index as f64 / fps.max(1.0);
    let active_window = window_index(time, windows, &mut window_cursor);
    let in_window = active_window.is_some();
    let mut should_drop = is_intra_vop && in_window && drop_probability > 0.0;

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
        .write_all(&unit)
        .map_err(|err| format!("Failed to write output bitstream: {err}"))?;
    }

    vop_index += 1;
  }

  if !has_vop {
    if !has_units {
      return Err("No MPEG-4 start codes found in bitstream".into());
    }
    return Err("No VOP frames found in MPEG-4 bitstream".into());
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::path::{Path, PathBuf};
  use std::time::{SystemTime, UNIX_EPOCH};

  fn unique_temp_dir(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    let dir = std::env::temp_dir().join(format!("bitrot-{label}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  fn write_temp_file(dir: &Path, name: &str, data: &[u8]) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, data).unwrap();
    path
  }

  fn remove_path(path: &Path) {
    let _ = fs::remove_file(path);
  }

  fn remove_dir(path: &Path) {
    let _ = fs::remove_dir_all(path);
  }

  fn make_unit(code: u8, payload: &[u8]) -> Vec<u8> {
    let mut unit = vec![0x00, 0x00, 0x01, code];
    unit.extend_from_slice(payload);
    unit
  }

  fn contains_slice(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
      return false;
    }
    haystack.windows(needle.len()).any(|window| window == needle)
  }

  #[test]
  fn datamosh_preserves_headers_and_first_intra_vop() {
    let temp_dir = unique_temp_dir("datamosh-preserve");
    let header = make_unit(0xB0, &[0x11, 0x22]);
    let vop_one = make_unit(0xB6, &[0b0000_0000, 0xAA]); // Intra VOP
    let vop_two = make_unit(0xB6, &[0b0000_0000, 0xBB]); // Intra VOP
    let input_bytes = [header.clone(), vop_one.clone(), vop_two.clone()].concat();
    let input_path = write_temp_file(&temp_dir, "input.m4v", &input_bytes);
    let output_path = temp_dir.join("output.m4v");

    let result = process_datamosh(
      input_path.to_str().unwrap(),
      output_path.to_str().unwrap(),
      1.0,
      &[SceneWindow {
        start: 0.0,
        end: 10.0,
      }],
      100.0,
      42,
      None,
    );
    assert!(result.is_ok());

    let output = fs::read(&output_path).unwrap();
    assert!(contains_slice(&output, &header));
    assert!(contains_slice(&output, &vop_one));
    assert!(!contains_slice(&output, &vop_two));

    remove_path(&input_path);
    remove_path(&output_path);
    remove_dir(&temp_dir);
  }

  #[test]
  fn datamosh_errors_without_start_codes() {
    let temp_dir = unique_temp_dir("datamosh-no-start");
    let input_path = write_temp_file(&temp_dir, "input.bin", &[0x12, 0x34, 0x56, 0x78]);
    let output_path = temp_dir.join("output.bin");

    let result = process_datamosh(
      input_path.to_str().unwrap(),
      output_path.to_str().unwrap(),
      1.0,
      &[],
      0.0,
      1,
      None,
    );
    assert!(result.is_err());
    let message = result.err().unwrap();
    assert!(message.contains("No MPEG-4 start codes found"));

    remove_path(&input_path);
    remove_path(&output_path);
    remove_dir(&temp_dir);
  }

  #[test]
  fn datamosh_errors_without_vops() {
    let temp_dir = unique_temp_dir("datamosh-no-vop");
    let header = make_unit(0xB0, &[0x01, 0x02]);
    let input_path = write_temp_file(&temp_dir, "input.m4v", &header);
    let output_path = temp_dir.join("output.m4v");

    let result = process_datamosh(
      input_path.to_str().unwrap(),
      output_path.to_str().unwrap(),
      1.0,
      &[],
      0.0,
      1,
      None,
    );
    assert!(result.is_err());
    let message = result.err().unwrap();
    assert!(message.contains("No VOP frames found"));

    remove_path(&input_path);
    remove_path(&output_path);
    remove_dir(&temp_dir);
  }

  #[test]
  fn datamosh_prepends_extradata_prefix() {
    let temp_dir = unique_temp_dir("datamosh-extradata");
    let header = make_unit(0xB0, &[0x22, 0x33]);
    let vop = make_unit(0xB6, &[0b0000_0000, 0xCC]);
    let input_bytes = [header.clone(), vop.clone()].concat();
    let input_path = write_temp_file(&temp_dir, "input.m4v", &input_bytes);
    let output_path = temp_dir.join("output.m4v");

    let result = process_datamosh(
      input_path.to_str().unwrap(),
      output_path.to_str().unwrap(),
      1.0,
      &[],
      0.0,
      1,
      Some("B0AABB"),
    );
    assert!(result.is_ok());

    let output = fs::read(&output_path).unwrap();
    // Extradata gets a start code prefix before being written.
    assert!(output.starts_with(&[0x00, 0x00, 0x01, 0xB0, 0xAA, 0xBB]));
    assert!(contains_slice(&output, &header));
    assert!(contains_slice(&output, &vop));

    remove_path(&input_path);
    remove_path(&output_path);
    remove_dir(&temp_dir);
  }

  #[test]
  fn datamosh_drops_intra_frames_only_inside_windows() {
    let temp_dir = unique_temp_dir("datamosh-window");
    let header = make_unit(0xB0, &[0x00]);
    let vop_zero = make_unit(0xB6, &[0b0000_0000, 0x10]);
    let vop_one = make_unit(0xB6, &[0b0000_0000, 0x20]);
    let vop_two = make_unit(0xB6, &[0b0000_0000, 0x30]);
    let input_bytes = [
      header.clone(),
      vop_zero.clone(),
      vop_one.clone(),
      vop_two.clone()
    ]
    .concat();
    let input_path = write_temp_file(&temp_dir, "input.m4v", &input_bytes);
    let output_path = temp_dir.join("output.m4v");

    let result = process_datamosh(
      input_path.to_str().unwrap(),
      output_path.to_str().unwrap(),
      1.0,
      &[SceneWindow {
        start: 1.5,
        end: 2.5,
      }],
      100.0,
      123,
      None,
    );
    assert!(result.is_ok());

    let output = fs::read(&output_path).unwrap();
    assert!(contains_slice(&output, &header));
    assert!(contains_slice(&output, &vop_zero));
    assert!(contains_slice(&output, &vop_one));
    assert!(!contains_slice(&output, &vop_two));

    remove_path(&input_path);
    remove_path(&output_path);
    remove_dir(&temp_dir);
  }
}
