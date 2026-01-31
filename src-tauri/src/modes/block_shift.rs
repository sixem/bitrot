// Native block shift pipeline for macroblock-style displacement.
// This keeps the codec intact while rearranging pixels in an 8x8/16x16 grid.
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex
  },
  time::{Duration, Instant}
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_shell::process::CommandEvent;

use crate::ffmpeg::resolve_ffmpeg_command;
use crate::native::pipeline::{
  build_decode_args,
  build_encode_args,
  build_mux_args,
  build_temp_video_path,
  cleanup_file,
  normalize_trim_range,
  paths_match,
  run_ffmpeg_output,
  NativeEncoding
};
use crate::native::preview::{
  build_preview_path,
  build_preview_unique_path,
  downscale_rgba_nearest,
  encode_preview_frame,
  preview_expected_len,
  resolve_preview_size,
  PreviewBuffers
};

#[derive(Default)]
pub struct BlockShiftJobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl BlockShiftJobs {
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
pub struct BlockShiftConfig {
  pub block_size: u32,
  pub max_offset: u32,
  pub offset_step: u32,
  pub intensity: f32,
  pub seed: u32
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BlockShiftProgress {
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
struct BlockShiftLog {
  job_id: String,
  message: String
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BlockShiftPreviewEvent {
  job_id: String,
  frame: u64,
  path: String
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BlockShiftPreviewResponse {
  path: String
}

fn emit_log(window: &Window, job_id: &str, message: impl Into<String>) {
  let payload = BlockShiftLog {
    job_id: job_id.to_string(),
    message: message.into()
  };
  let _ = window.emit("block-shift-log", payload);
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
  let payload = BlockShiftProgress {
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
  let _ = window.emit("block-shift-progress", payload);
}

fn emit_preview(window: &Window, job_id: &str, frame: u64, path: &Path) {
  let payload = BlockShiftPreviewEvent {
    job_id: job_id.to_string(),
    frame,
    path: path.to_string_lossy().into_owned()
  };
  let _ = window.emit("block-shift-preview", payload);
}

fn blend_channel(a: u8, b: u8, mix: f32) -> u8 {
  let inv = 1.0 - mix;
  ((a as f32 * inv) + (b as f32 * mix)).round().clamp(0.0, 255.0) as u8
}

// Reusable buffers for per-frame processing to avoid extra allocations.
struct BlockShiftWorkspace {
  width: usize,
  height: usize,
  output: Vec<u8>
}

impl BlockShiftWorkspace {
  fn new(width: usize, height: usize) -> Self {
    let byte_len = width.saturating_mul(height).saturating_mul(4);
    Self {
      width,
      height,
      output: vec![0u8; byte_len]
    }
  }

  fn ensure_size(&mut self, byte_len: usize) {
    if self.output.len() != byte_len {
      self.output.resize(byte_len, 0);
    }
  }
}

fn quantize_offset(value: i32, step: i32) -> i32 {
  if step <= 1 {
    return value;
  }
  (value / step) * step
}

fn block_offset(
  seed: u32,
  frame_index: u64,
  block_x: usize,
  block_y: usize,
  max_offset: i32,
  step: i32
) -> (i32, i32) {
  if max_offset <= 0 {
    return (0, 0);
  }
  let mut rng = seed
    ^ (frame_index as u32).wrapping_mul(1664525)
    ^ (block_x as u32).wrapping_mul(1013904223)
    ^ (block_y as u32).wrapping_mul(69069);
  rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
  let range = (max_offset * 2 + 1) as u32;
  let dx = (rng.rotate_left(5) % range) as i32 - max_offset;
  rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
  let dy = (rng.rotate_left(9) % range) as i32 - max_offset;
  (quantize_offset(dx, step), quantize_offset(dy, step))
}

fn process_block_shift_frame<'a>(
  frame: &[u8],
  workspace: &'a mut BlockShiftWorkspace,
  config: &BlockShiftConfig,
  frame_index: u64
) -> &'a [u8] {
  let byte_len = frame.len();
  workspace.ensure_size(byte_len);
  if byte_len == 0 {
    return &workspace.output;
  }
  workspace.output.copy_from_slice(frame);

  let width = workspace.width;
  let height = workspace.height;
  if width == 0 || height == 0 {
    return &workspace.output;
  }
  let pixel_count = width.saturating_mul(height);
  if pixel_count < 2 {
    return &workspace.output;
  }

  let block_size = config.block_size.max(2) as usize;
  let max_offset = config.max_offset as i32;
  let step = config.offset_step.max(1) as i32;
  let mix = (config.intensity / 100.0).clamp(0.0, 1.0);
  if mix <= 0.0 || max_offset <= 0 {
    return &workspace.output;
  }
  let is_full_strength = mix >= 0.999;

  for by in (0..height).step_by(block_size) {
    let end_y = (by + block_size).min(height);
    for bx in (0..width).step_by(block_size) {
      let end_x = (bx + block_size).min(width);
      let (dx, dy) = block_offset(config.seed, frame_index, bx, by, max_offset, step);
      for y in by..end_y {
        for x in bx..end_x {
          let src_x = (x as i32 + dx).clamp(0, (width - 1) as i32) as usize;
          let src_y = (y as i32 + dy).clamp(0, (height - 1) as i32) as usize;
          let src_idx = (src_y * width + src_x) * 4;
          let dst_idx = (y * width + x) * 4;
          if is_full_strength {
            workspace.output[dst_idx..dst_idx + 3]
              .copy_from_slice(&frame[src_idx..src_idx + 3]);
          } else {
            for channel in 0..3 {
              let base = frame[dst_idx + channel];
              let mapped = frame[src_idx + channel];
              workspace.output[dst_idx + channel] = blend_channel(base, mapped, mix);
            }
          }
          workspace.output[dst_idx + 3] = frame[dst_idx + 3];
        }
      }
    }
  }

  &workspace.output
}

async fn render_block_shift_preview(
  app: &AppHandle,
  width: u32,
  height: u32,
  frame: &[u8],
  config: &BlockShiftConfig
) -> Result<BlockShiftPreviewResponse, String> {
  let expected = preview_expected_len(width, height)?;
  if frame.len() < expected {
    return Err(format!(
      "Preview buffer size mismatch (expected {expected} bytes, got {}).",
      frame.len()
    ));
  }

  let mut workspace = BlockShiftWorkspace::new(width as usize, height as usize);
  let processed =
    process_block_shift_frame(&frame[..expected], &mut workspace, config, 0);
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

  Ok(BlockShiftPreviewResponse {
    path: preview_path.to_string_lossy().into_owned()
  })
}

#[tauri::command]
pub fn block_shift_preview_start(
  preview_id: String,
  width: u32,
  height: u32,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  let expected_len = preview_expected_len(width, height)?;
  state.start(&preview_id, width, height, expected_len)
}

#[tauri::command]
pub fn block_shift_preview_append(
  preview_id: String,
  chunk: Vec<u8>,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  if chunk.is_empty() {
    return Ok(());
  }
  state.append(&preview_id, chunk)
}

#[tauri::command]
pub async fn block_shift_preview_finish(
  app: AppHandle,
  preview_id: String,
  config: BlockShiftConfig,
  state: State<'_, PreviewBuffers>
) -> Result<BlockShiftPreviewResponse, String> {
  let buffer = state.finish(&preview_id)?;
  if buffer.data.len() != buffer.expected_len {
    return Err(format!(
      "Preview buffer size mismatch (expected {} bytes, got {}).",
      buffer.expected_len,
      buffer.data.len()
    ));
  }
  render_block_shift_preview(&app, buffer.width, buffer.height, &buffer.data, &config)
    .await
}

#[tauri::command]
pub fn block_shift_preview_discard(
  preview_id: String,
  state: State<'_, PreviewBuffers>
) -> Result<(), String> {
  state.discard(&preview_id);
  Ok(())
}

#[tauri::command]
pub async fn block_shift_cancel(
  job_id: String,
  state: State<'_, BlockShiftJobs>
) -> Result<(), String> {
  if state.cancel(&job_id) {
    Ok(())
  } else {
    Err("Unknown block shift job".into())
  }
}

#[tauri::command]
pub async fn block_shift_process(
  window: Window,
  app: AppHandle,
  state: State<'_, BlockShiftJobs>,
  job_id: String,
  input_path: String,
  output_path: String,
  width: u32,
  height: u32,
  fps: f64,
  duration_seconds: Option<f64>,
  trim_start_seconds: Option<f64>,
  trim_end_seconds: Option<f64>,
  config: BlockShiftConfig,
  preview_enabled: bool,
  encoding: NativeEncoding
) -> Result<(), String> {
  if paths_match(&input_path, &output_path) {
    return Err("Output path matches the input file. Choose a different output name.".into());
  }

  let cancel_flag = state.register(&job_id);
  emit_log(&window, &job_id, "Block shift started.");

  if width < 2 || height < 2 {
    cleanup_file(&PathBuf::from(&output_path));
    state.finish(&job_id);
    return Err("Invalid video dimensions for block shift.".into());
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
  let temp_video = build_temp_video_path(&output_path, &encoding.format, "block-shift");
  let frame_size = (safe_width as usize) * (safe_height as usize) * 4;
  let trim_range = normalize_trim_range(trim_start_seconds, trim_end_seconds);
  let duration_for_progress = trim_range
    .map(|(start, end)| (end - start).max(0.0))
    .or(duration_seconds);
  let total_frames = duration_for_progress
    .filter(|duration| *duration > 0.0 && safe_fps > 0.0)
    .map(|duration| (duration * safe_fps).ceil() as u64);

  let decode_args =
    build_decode_args(&input_path, safe_width, safe_height, trim_range, "rgba");
  let encode_args = build_encode_args(
    safe_width,
    safe_height,
    safe_fps,
    &encoding,
    &temp_video,
    "rgba"
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
  let mut workspace = BlockShiftWorkspace::new(safe_width as usize, safe_height as usize);
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
      emit_log(&window, &job_id, "Block shift canceled.");
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
          let processed =
            process_block_shift_frame(frame, &mut workspace, &config, processed_frames);
          encode_child
            .write(processed)
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
    build_mux_args(&temp_video, &input_path, &output_path, trim_range, &encoding)
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

  emit_log(&window, &job_id, "Block shift completed.");
  state.finish(&job_id);
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
