// Streaming ffprobe helpers for VFR frame maps (keeps memory bounded).
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;

use crate::ffmpeg::resolve_ffmpeg_command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMapResponse {
  pub times: Vec<f64>,
  pub keyframe_times: Vec<f64>,
  pub duration_seconds: Option<f64>,
}

#[derive(Default)]
struct FrameFields {
  key_frame: Option<bool>,
  pict_type: Option<char>,
  pkt_pts_time: Option<f64>,
  best_effort_timestamp_time: Option<f64>,
}

fn parse_number(value: &str) -> Option<f64> {
  if value.trim().is_empty() {
    return None;
  }
  let parsed = value.trim().parse::<f64>().ok()?;
  if parsed.is_finite() {
    Some(parsed)
  } else {
    None
  }
}

fn parse_key_frame(value: &str) -> Option<bool> {
  match value.trim() {
    "1" => Some(true),
    "0" => Some(false),
    _ => None,
  }
}

fn apply_key_value(fields: &mut FrameFields, key: &str, value: &str) {
  match key.trim() {
    "key_frame" => {
      fields.key_frame = parse_key_frame(value);
    }
    "pict_type" => {
      fields.pict_type = value.trim().chars().next();
    }
    "pkt_pts_time" => {
      fields.pkt_pts_time = parse_number(value);
    }
    "best_effort_timestamp_time" => {
      fields.best_effort_timestamp_time = parse_number(value);
    }
    _ => {}
  }
}

fn parse_frame_line(line: &str) -> Option<FrameFields> {
  let trimmed = line.trim();
  if trimmed.is_empty() {
    return None;
  }

  let mut fields = FrameFields::default();
  if trimmed.contains('=') {
    for segment in trimmed.split('|') {
      let segment = segment.trim();
      if segment.is_empty() || segment == "frame" {
        continue;
      }
      let mut iter = segment.splitn(2, '=');
      let key = iter.next().unwrap_or("");
      let value = iter.next().unwrap_or("");
      if !key.is_empty() {
        apply_key_value(&mut fields, key, value);
      }
    }
    return Some(fields);
  }

  let delimiter = if trimmed.contains('|') { '|' } else { ',' };
  let parts: Vec<&str> = trimmed.split(delimiter).map(|part| part.trim()).collect();
  if parts.is_empty() {
    return None;
  }
  let mut offset = 0usize;
  if parts[0] == "frame" {
    offset = 1;
  }
  if parts.len().saturating_sub(offset) >= 4 {
    fields.key_frame = parse_key_frame(parts[offset]);
    fields.pict_type = parts[offset + 1].chars().next();
    fields.pkt_pts_time = parse_number(parts[offset + 2]);
    fields.best_effort_timestamp_time = parse_number(parts[offset + 3]);
  }
  Some(fields)
}

fn extract_frame_time(fields: &FrameFields) -> Option<f64> {
  fields
    .pkt_pts_time
    .or(fields.best_effort_timestamp_time)
}

fn is_keyframe(fields: &FrameFields) -> bool {
  if fields.key_frame == Some(true) {
    return true;
  }
  matches!(fields.pict_type, Some('I') | Some('i'))
}

async fn probe_duration(app: &AppHandle, path: &str) -> Option<f64> {
  let args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    "--",
    path,
  ];
  let output = resolve_ffmpeg_command(app, "ffprobe")
    .ok()?
    .args(args)
    .output()
    .await
    .ok()?;
  if !output.status.success() {
    return None;
  }
  let raw = String::from_utf8_lossy(&output.stdout);
  parse_number(raw.trim())
}

// Streams ffprobe output into a minimal frame map (times + keyframe times).
#[tauri::command]
pub async fn ffprobe_frame_map(
  app: AppHandle,
  path: String,
) -> Result<FrameMapResponse, String> {
  let path = path.trim().to_string();
  if path.is_empty() {
    return Err("ffprobe received an empty file path.".into());
  }

  let args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "frame=key_frame,pict_type,pkt_pts_time,best_effort_timestamp_time",
    "-of",
    "compact=p=0",
    "--",
    path.as_str(),
  ];

  let (mut rx, _child) = resolve_ffmpeg_command(&app, "ffprobe")?
    .args(args)
    .spawn()
    .map_err(|error| error.to_string())?;

  let mut times = Vec::new();
  let mut keyframe_times = Vec::new();
  let mut stderr_lines: Vec<String> = Vec::new();
  let mut exit_code = None;

  while let Some(event) = rx.recv().await {
    match event {
      CommandEvent::Stdout(line) => {
        let text = String::from_utf8_lossy(&line);
        if let Some(fields) = parse_frame_line(text.trim()) {
          if let Some(time) = extract_frame_time(&fields) {
            times.push(time);
            if is_keyframe(&fields) {
              keyframe_times.push(time);
            }
          }
        }
      }
      CommandEvent::Stderr(line) => {
        let message = String::from_utf8_lossy(&line).trim().to_string();
        if !message.is_empty() {
          stderr_lines.push(message);
        }
      }
      CommandEvent::Error(error) => {
        stderr_lines.push(error);
      }
      CommandEvent::Terminated(payload) => {
        exit_code = payload.code;
      }
      _ => {}
    }
  }

  let code = exit_code.unwrap_or(-1);
  if code != 0 {
    let message = if stderr_lines.is_empty() {
      "ffprobe failed to return frame data".to_string()
    } else {
      stderr_lines.join("\n")
    };
    return Err(message);
  }

  if times.is_empty() {
    return Err("ffprobe did not return frame data.".into());
  }

  let duration_seconds = probe_duration(&app, &path).await;
  Ok(FrameMapResponse {
    times,
    keyframe_times,
    duration_seconds,
  })
}
