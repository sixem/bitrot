// Preview IPC + PNG encoding helpers for the pixelsort pipeline.

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};

use super::algo::{pixelsort_frame, PixelsortConfig};
use super::workspace::FrameWorkspace;
use crate::native::pipeline::cleanup_file;
use crate::native::preview::{
  build_preview_unique_path,
  downscale_rgba_nearest,
  encode_preview_frame,
  preview_expected_len,
  resolve_preview_size,
  PreviewBuffers
};

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
  pub path: String
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PixelsortPreviewDebug {
  stage: String,
  preview_id: String,
  width: Option<u32>,
  height: Option<u32>,
  expected_len: Option<usize>,
  received_len: Option<usize>,
  chunk_len: Option<usize>,
  chunk_index: Option<usize>,
  message: Option<String>
}

// Gate preview debug logs behind an env var so the default output stays clean.
fn preview_debug_enabled() -> bool {
  std::env::var("BITROT_PREVIEW_DEBUG")
    .map(|value| value != "0")
    .unwrap_or(false)
}

fn emit_preview_debug(app: &AppHandle, payload: PixelsortPreviewDebug) {
  if !preview_debug_enabled() {
    return;
  }
  let _ = app.emit("pixelsort-preview-debug", payload.clone());
  let mut parts = vec![
    format!("stage={}", payload.stage),
    format!("previewId={}", payload.preview_id)
  ];
  if let (Some(width), Some(height)) = (payload.width, payload.height) {
    parts.push(format!("size={width}x{height}"));
  }
  if let Some(expected) = payload.expected_len {
    parts.push(format!("expected={expected}"));
  }
  if let Some(received) = payload.received_len {
    parts.push(format!("received={received}"));
  }
  if let Some(chunk_len) = payload.chunk_len {
    parts.push(format!("chunk={chunk_len}"));
  }
  if let Some(chunk_index) = payload.chunk_index {
    parts.push(format!("chunkIndex={chunk_index}"));
  }
  if let Some(message) = payload.message {
    parts.push(format!("msg={message}"));
  }
  eprintln!("[pixelsort-preview] {}", parts.join(" "));
}

pub(crate) fn emit_preview(window: &Window, job_id: &str, frame: u64, path: &Path) {
  let payload = PixelsortPreviewEvent {
    job_id: job_id.to_string(),
    frame,
    path: path.to_string_lossy().into_owned()
  };
  let _ = window.emit("pixelsort-preview", payload);
}

// Processes RGBA bytes into a pixelsorted PNG and returns the output path.
async fn render_pixelsort_preview(
  app: &AppHandle,
  width: u32,
  height: u32,
  frame: &[u8],
  config: &PixelsortConfig
) -> Result<PixelsortPreviewResponse, String> {
  let expected = preview_expected_len(width, height)?;
  if frame.len() < expected {
    return Err(format!(
      "Preview buffer size mismatch (expected {expected} bytes, got {}).",
      frame.len()
    ));
  }

  let mut workspace = FrameWorkspace::new(width as usize, height as usize);
  let processed = pixelsort_frame(&frame[..expected], &mut workspace, config, 0);
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

  Ok(PixelsortPreviewResponse {
    path: preview_path.to_string_lossy().into_owned()
  })
}

// Chunked manual preview uploads keep IPC payloads well under size limits.
#[tauri::command]
pub fn pixelsort_preview_start(
  app: AppHandle,
  preview_id: String,
  width: u32,
  height: u32,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  let expected_len = preview_expected_len(width, height)?;
  let result = state.start(&preview_id, width, height, expected_len);
  emit_preview_debug(
    &app,
    PixelsortPreviewDebug {
      stage: "start".into(),
      preview_id,
      width: Some(width),
      height: Some(height),
      expected_len: Some(expected_len),
      received_len: Some(0),
      chunk_len: None,
      chunk_index: None,
      message: result.as_ref().err().cloned()
    }
  );
  result
}

#[tauri::command]
pub fn pixelsort_preview_append(
  app: AppHandle,
  preview_id: String,
  chunk: Vec<u8>,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  if chunk.is_empty() {
    return Ok(());
  }
  let chunk_len = chunk.len();
  state.append(&preview_id, chunk)?;
  emit_preview_debug(
    &app,
    PixelsortPreviewDebug {
      stage: "append".into(),
      preview_id,
      width: None,
      height: None,
      expected_len: None,
      received_len: None,
      chunk_len: Some(chunk_len),
      chunk_index: None,
      message: None
    }
  );
  Ok(())
}

#[tauri::command]
pub async fn pixelsort_preview_finish(
  app: AppHandle,
  preview_id: String,
  config: PixelsortConfig,
  state: State<'_, PreviewBuffers>
) -> Result<PixelsortPreviewResponse, String> {
  let buffer = state.finish(&preview_id)?;
  if buffer.data.len() != buffer.expected_len {
    let message = format!(
      "Preview buffer size mismatch (expected {} bytes, got {}).",
      buffer.expected_len,
      buffer.data.len()
    );
    emit_preview_debug(
      &app,
      PixelsortPreviewDebug {
        stage: "finish".into(),
        preview_id,
        width: Some(buffer.width),
        height: Some(buffer.height),
        expected_len: Some(buffer.expected_len),
        received_len: Some(buffer.data.len()),
        chunk_len: None,
        chunk_index: None,
        message: Some(message.clone())
      }
    );
    return Err(message);
  }
  emit_preview_debug(
    &app,
    PixelsortPreviewDebug {
      stage: "finish".into(),
      preview_id: preview_id.clone(),
      width: Some(buffer.width),
      height: Some(buffer.height),
      expected_len: Some(buffer.expected_len),
      received_len: Some(buffer.data.len()),
      chunk_len: None,
      chunk_index: None,
      message: None
    }
  );
  let result =
    render_pixelsort_preview(&app, buffer.width, buffer.height, &buffer.data, &config)
      .await;
  let render_message = match &result {
    Ok(response) => Some(format!("ok path={}", response.path)),
    Err(error) => Some(error.clone())
  };
  emit_preview_debug(
    &app,
    PixelsortPreviewDebug {
      stage: "render".into(),
      preview_id,
      width: Some(buffer.width),
      height: Some(buffer.height),
      expected_len: Some(buffer.expected_len),
      received_len: Some(buffer.data.len()),
      chunk_len: None,
      chunk_index: None,
      message: render_message
    }
  );
  result
}

#[tauri::command]
pub fn pixelsort_preview_discard(
  app: AppHandle,
  preview_id: String,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  state.discard(&preview_id);
  emit_preview_debug(
    &app,
    PixelsortPreviewDebug {
      stage: "discard".into(),
      preview_id,
      width: None,
      height: None,
      expected_len: None,
      received_len: None,
      chunk_len: None,
      chunk_index: None,
      message: None
    }
  );
  Ok(())
}
