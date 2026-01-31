// Preview handling for modulo mapping (manual preview uploads + live updates).
use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};

use crate::native::pipeline::cleanup_file;
use crate::native::preview::{
  build_preview_unique_path,
  downscale_rgba_nearest,
  encode_preview_frame,
  preview_expected_len,
  resolve_preview_size,
  PreviewBuffers
};

use super::math::{process_modulo_mapping_frame, ModuloMappingConfig, ModuloMappingWorkspace};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModuloMappingPreviewEvent {
  job_id: String,
  frame: u64,
  path: String
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModuloMappingPreviewResponse {
  pub path: String
}

pub(crate) fn emit_preview(window: &Window, job_id: &str, frame: u64, path: &Path) {
  let payload = ModuloMappingPreviewEvent {
    job_id: job_id.to_string(),
    frame,
    path: path.to_string_lossy().into_owned()
  };
  let _ = window.emit("modulo-mapping-preview", payload);
}

async fn render_modulo_mapping_preview(
  app: &AppHandle,
  width: u32,
  height: u32,
  frame: &[u8],
  config: &ModuloMappingConfig
) -> Result<ModuloMappingPreviewResponse, String> {
  let expected = preview_expected_len(width, height)?;
  if frame.len() < expected {
    return Err(format!(
      "Preview buffer size mismatch (expected {expected} bytes, got {}).",
      frame.len()
    ));
  }

  let mut workspace = ModuloMappingWorkspace::new(width as usize, height as usize);
  let processed = process_modulo_mapping_frame(
    &frame[..expected],
    &mut workspace,
    config,
    0,
    width as usize,
    height as usize
  );
  let (preview_width, preview_height) = resolve_preview_size(width, height);

  let preview_path = build_preview_unique_path("manual");
  let encode_result = if preview_width == width && preview_height == height {
    encode_preview_frame(app, processed, width, height, &preview_path).await
  } else {
    let preview_frame =
      downscale_rgba_nearest(processed, width, height, preview_width, preview_height);
    encode_preview_frame(
      app,
      &preview_frame,
      preview_width,
      preview_height,
      &preview_path
    )
    .await
  };
  if let Err(error) = encode_result {
    cleanup_file(&preview_path);
    return Err(error);
  }

  Ok(ModuloMappingPreviewResponse {
    path: preview_path.to_string_lossy().into_owned()
  })
}

// Chunked manual preview uploads keep IPC payloads well under size limits.
pub(super) fn modulo_mapping_preview_start(
  preview_id: String,
  width: u32,
  height: u32,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  let expected_len = preview_expected_len(width, height)?;
  state.start(&preview_id, width, height, expected_len)
}

pub(super) fn modulo_mapping_preview_append(
  preview_id: String,
  chunk: Vec<u8>,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  if chunk.is_empty() {
    return Ok(());
  }
  state.append(&preview_id, chunk)
}

pub(super) async fn modulo_mapping_preview_finish(
  app: AppHandle,
  preview_id: String,
  config: ModuloMappingConfig,
  state: State<'_, PreviewBuffers>
) -> Result<ModuloMappingPreviewResponse, String> {
  let buffer = state.finish(&preview_id)?;
  if buffer.data.len() != buffer.expected_len {
    return Err(format!(
      "Preview buffer size mismatch (expected {} bytes, got {}).",
      buffer.expected_len,
      buffer.data.len()
    ));
  }
  render_modulo_mapping_preview(&app, buffer.width, buffer.height, &buffer.data, &config)
    .await
}

pub(super) fn modulo_mapping_preview_discard(
  preview_id: String,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  state.discard(&preview_id);
  Ok(())
}
