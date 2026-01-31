// Byte-range (modulo mapping) commands, wired to focused submodules.
// The command functions live here to keep tauri handler paths stable.
mod jobs;
mod math;
mod pipeline;
mod preview;

use tauri::{AppHandle, State, Window};

use crate::native::pipeline::NativeEncoding;
use crate::native::preview::PreviewBuffers;

pub use jobs::ModuloMappingJobs;
pub use math::ModuloMappingConfig;
pub use preview::ModuloMappingPreviewResponse;

// Command wrappers keep the IPC surface close to the module boundary.
#[tauri::command]
pub async fn modulo_mapping_process(
  window: Window,
  app: AppHandle,
  state: State<'_, ModuloMappingJobs>,
  job_id: String,
  input_path: String,
  output_path: String,
  width: u32,
  height: u32,
  fps: f64,
  duration_seconds: Option<f64>,
  trim_start_seconds: Option<f64>,
  trim_end_seconds: Option<f64>,
  config: ModuloMappingConfig,
  preview_enabled: bool,
  encoding: NativeEncoding
) -> Result<(), String> {
  pipeline::modulo_mapping_process(
    window,
    app,
    state,
    job_id,
    input_path,
    output_path,
    width,
    height,
    fps,
    duration_seconds,
    trim_start_seconds,
    trim_end_seconds,
    config,
    preview_enabled,
    encoding
  )
  .await
}

#[tauri::command]
pub async fn modulo_mapping_cancel(
  job_id: String,
  state: State<'_, ModuloMappingJobs>
) -> Result<(), String> {
  jobs::modulo_mapping_cancel(job_id, state).await
}

#[tauri::command]
pub fn modulo_mapping_preview_start(
  preview_id: String,
  width: u32,
  height: u32,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  preview::modulo_mapping_preview_start(preview_id, width, height, state)
}

#[tauri::command]
pub fn modulo_mapping_preview_append(
  preview_id: String,
  chunk: Vec<u8>,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  preview::modulo_mapping_preview_append(preview_id, chunk, state)
}

#[tauri::command]
pub async fn modulo_mapping_preview_finish(
  app: AppHandle,
  preview_id: String,
  config: ModuloMappingConfig,
  state: State<'_, PreviewBuffers>
) -> Result<ModuloMappingPreviewResponse, String> {
  preview::modulo_mapping_preview_finish(app, preview_id, config, state).await
}

#[tauri::command]
pub fn modulo_mapping_preview_discard(
  preview_id: String,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  preview::modulo_mapping_preview_discard(preview_id, state)
}
