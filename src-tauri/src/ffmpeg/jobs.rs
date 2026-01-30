// Tauri command bridge for spawning and monitoring ffmpeg/ffprobe processes.

use std::{
  collections::HashMap,
  sync::{Arc, Mutex}
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

use crate::ffmpeg::{resolve_ffmpeg_command_with_source, CommandSource};

#[derive(Default)]
pub struct FfmpegJobs(pub Arc<Mutex<HashMap<String, CommandChild>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegStreamPayload {
  job_id: String,
  data: String
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegErrorPayload {
  job_id: String,
  message: String
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegClosePayload {
  job_id: String,
  code: Option<i32>,
  signal: Option<i32>
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegExecuteOutput {
  code: Option<i32>,
  stdout: String,
  stderr: String
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegExecuteResponse {
  output: FfmpegExecuteOutput,
  source: CommandSource
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegSpawnResponse {
  source: CommandSource
}

fn validate_program(program: &str) -> Result<(), String> {
  match program {
    "ffmpeg" | "ffprobe" => Ok(()),
    _ => Err("Only ffmpeg or ffprobe can be executed.".to_string())
  }
}

#[tauri::command]
pub async fn ffmpeg_execute(
  app: AppHandle,
  program: String,
  args: Vec<String>
) -> Result<FfmpegExecuteResponse, String> {
  let program = program.trim().to_lowercase();
  validate_program(&program)?;
  let resolved = resolve_ffmpeg_command_with_source(&app, &program)?;
  let output = resolved
    .command
    .args(args)
    .output()
    .await
    .map_err(|error| error.to_string())?;
  Ok(FfmpegExecuteResponse {
    output: FfmpegExecuteOutput {
      code: output.status.code(),
      stdout: String::from_utf8_lossy(&output.stdout).to_string(),
      stderr: String::from_utf8_lossy(&output.stderr).to_string()
    },
    source: resolved.source
  })
}

#[tauri::command]
pub async fn ffmpeg_spawn(
  app: AppHandle,
  window: Window,
  state: State<'_, FfmpegJobs>,
  program: String,
  args: Vec<String>,
  job_id: String
) -> Result<FfmpegSpawnResponse, String> {
  let program = program.trim().to_lowercase();
  validate_program(&program)?;
  let job_id = job_id.trim().to_string();
  if job_id.is_empty() {
    return Err("ffmpeg job id is required.".to_string());
  }
  {
    let lock = state.0.lock().map_err(|_| "ffmpeg job lock poisoned")?;
    if lock.contains_key(&job_id) {
      return Err("ffmpeg job id already exists.".to_string());
    }
  }

  let resolved = resolve_ffmpeg_command_with_source(&app, &program)?;
  let (mut rx, child) = resolved
    .command
    .args(args)
    .spawn()
    .map_err(|error| error.to_string())?;

  {
    let mut lock = state.0.lock().map_err(|_| "ffmpeg job lock poisoned")?;
    if lock.contains_key(&job_id) {
      let _ = child.kill();
      return Err("ffmpeg job id already exists.".to_string());
    }
    lock.insert(job_id.clone(), child);
  }

  let jobs = state.0.clone();
  let emit_window = window.clone();
  let emit_job_id = job_id.clone();

  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => {
          let payload = FfmpegStreamPayload {
            job_id: emit_job_id.clone(),
            data: String::from_utf8_lossy(&line).to_string()
          };
          let _ = emit_window.emit("ffmpeg-stdout", payload);
        }
        CommandEvent::Stderr(line) => {
          let payload = FfmpegStreamPayload {
            job_id: emit_job_id.clone(),
            data: String::from_utf8_lossy(&line).to_string()
          };
          let _ = emit_window.emit("ffmpeg-stderr", payload);
        }
        CommandEvent::Error(message) => {
          let payload = FfmpegErrorPayload {
            job_id: emit_job_id.clone(),
            message
          };
          let _ = emit_window.emit("ffmpeg-error", payload);
        }
        CommandEvent::Terminated(payload) => {
          let payload = FfmpegClosePayload {
            job_id: emit_job_id.clone(),
            code: payload.code,
            signal: payload.signal
          };
          let _ = emit_window.emit("ffmpeg-close", payload);
        }
        _ => {}
      }
    }
    let mut lock = jobs
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    lock.remove(&emit_job_id);
  });

  Ok(FfmpegSpawnResponse {
    source: resolved.source
  })
}

#[tauri::command]
pub fn ffmpeg_kill(state: State<'_, FfmpegJobs>, job_id: String) -> Result<(), String> {
  let trimmed = job_id.trim();
  if trimmed.is_empty() {
    return Ok(());
  }
  let mut lock = state.0.lock().map_err(|_| "ffmpeg job lock poisoned")?;
  if let Some(child) = lock.remove(trimmed) {
    child.kill().map_err(|error| error.to_string())?;
  }
  Ok(())
}
