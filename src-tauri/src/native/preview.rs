// Preview buffer storage + PNG encoding shared by native pipelines.
use std::{
  collections::HashMap,
  path::PathBuf,
  sync::Mutex,
  time::{Duration, Instant, SystemTime, UNIX_EPOCH}
};

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;

use crate::ffmpeg::resolve_ffmpeg_command;
use crate::native::pipeline::cleanup_file;

// Holds chunked preview buffers so large RGBA payloads can arrive safely over IPC.
#[derive(Default)]
pub struct PreviewBuffers(Mutex<HashMap<String, PreviewBuffer>>);

pub(crate) struct PreviewBuffer {
  pub width: u32,
  pub height: u32,
  pub expected_len: usize,
  pub data: Vec<u8>,
  last_updated: Instant
}

// Drop stale uploads so aborted previews do not leak memory.
const PREVIEW_BUFFER_TTL: Duration = Duration::from_secs(30);

impl PreviewBuffers {
  pub(crate) fn start(
    &self,
    preview_id: &str,
    width: u32,
    height: u32,
    expected_len: usize
  ) -> Result<(), String> {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    Self::prune_stale(&mut lock);
    if lock.contains_key(preview_id) {
      return Err("Preview upload already exists.".into());
    }
    lock.insert(
      preview_id.to_string(),
      PreviewBuffer {
        width,
        height,
        expected_len,
        data: Vec::with_capacity(expected_len),
        last_updated: Instant::now()
      }
    );
    Ok(())
  }

  pub(crate) fn append(&self, preview_id: &str, chunk: Vec<u8>) -> Result<(), String> {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    let buffer = lock
      .get_mut(preview_id)
      .ok_or_else(|| "Preview upload not found.".to_string())?;
    if buffer.data.len() + chunk.len() > buffer.expected_len {
      lock.remove(preview_id);
      return Err("Preview buffer overflow.".into());
    }
    buffer.data.extend_from_slice(&chunk);
    buffer.last_updated = Instant::now();
    Ok(())
  }

  pub(crate) fn finish(&self, preview_id: &str) -> Result<PreviewBuffer, String> {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    lock
      .remove(preview_id)
      .ok_or_else(|| "Preview upload not found.".to_string())
  }

  pub(crate) fn discard(&self, preview_id: &str) {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    lock.remove(preview_id);
  }

  fn prune_stale(lock: &mut HashMap<String, PreviewBuffer>) {
    let now = Instant::now();
    lock.retain(|_, buffer| now.duration_since(buffer.last_updated) <= PREVIEW_BUFFER_TTL);
  }
}

const MAX_PREVIEW_DIMENSION: u32 = 1280;

// Validates preview dimensions and returns the expected RGBA byte length.
pub fn preview_expected_len(width: u32, height: u32) -> Result<usize, String> {
  if width < 2 || height < 2 {
    return Err("Preview dimensions are invalid.".into());
  }
  (width as usize)
    .checked_mul(height as usize)
    .and_then(|value| value.checked_mul(4))
    .ok_or_else(|| "Preview dimensions are too large.".to_string())
}

pub fn resolve_preview_size(width: u32, height: u32) -> (u32, u32) {
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
pub fn downscale_rgba_nearest(
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

pub fn build_preview_path(tag: &str) -> PathBuf {
  let safe_tag = tag.replace(|c: char| !c.is_ascii_alphanumeric(), "_");
  let file_name = format!("bitrot-preview-{safe_tag}.png");
  std::env::temp_dir().join(file_name)
}

// Build a unique preview path for one-off renders.
pub fn build_preview_unique_path(tag: &str) -> PathBuf {
  let safe_tag = tag.replace(|c: char| !c.is_ascii_alphanumeric(), "_");
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|value| value.as_nanos())
    .unwrap_or(0);
  let file_name = format!("bitrot-preview-{safe_tag}-{nonce}.png");
  std::env::temp_dir().join(file_name)
}

// Preview encoding arguments for a single RGBA frame.
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

pub async fn encode_preview_frame(
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
    cleanup_file(output_path);
    return Err(if message.is_empty() {
      format!("Preview encoder failed with exit code {code}")
    } else {
      message
    });
  }
  Ok(())
}
