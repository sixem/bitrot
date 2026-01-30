// Shared helpers for native Rust pipelines (decode/encode/mux + path handling).
use std::{
  path::{Path, PathBuf},
  time::Duration
};

use serde::Deserialize;
use tauri::AppHandle;

use crate::ffmpeg::resolve_ffmpeg_command;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEncoding {
  pub encoder: String,
  pub preset: String,
  pub crf: Option<u32>,
  pub cq: Option<u32>,
  pub max_bitrate_kbps: Option<u32>,
  pub target_bitrate_kbps: Option<u32>,
  pub vp9_deadline: Option<String>,
  pub vp9_cpu_used: Option<u8>,
  pub format: String,
  pub audio_enabled: bool,
  pub audio_codec: Option<String>,
  pub audio_bitrate_kbps: Option<u32>,
  #[serde(default)]
  pub extra_encode_args: Vec<String>,
  #[serde(default)]
  pub extra_mux_args: Vec<String>
}

// Normalizes paths for comparison without touching the filesystem.
fn normalize_path_for_compare(value: &str) -> String {
  value
    .trim()
    .trim_matches('"')
    .replace('\\', "/")
    .trim_end_matches('/')
    .to_string()
}

// Compares two paths with a case-insensitive match on Windows.
pub fn paths_match(left: &str, right: &str) -> bool {
  let left = normalize_path_for_compare(left);
  let right = normalize_path_for_compare(right);
  if left.is_empty() || right.is_empty() {
    return false;
  }
  #[cfg(windows)]
  {
    left.eq_ignore_ascii_case(&right)
  }
  #[cfg(not(windows))]
  {
    left == right
  }
}

pub fn normalize_trim_range(start: Option<f64>, end: Option<f64>) -> Option<(f64, f64)> {
  let start = start?;
  let end = end?;
  if !start.is_finite() || !end.is_finite() {
    return None;
  }
  let safe_start = start.max(0.0);
  let safe_end = end.max(0.0);
  if safe_end <= safe_start {
    return None;
  }
  Some((safe_start, safe_end))
}

pub fn push_trim_args(args: &mut Vec<String>, trim: Option<(f64, f64)>) {
  if let Some((start, end)) = trim {
    args.push("-ss".into());
    args.push(format!("{start:.3}"));
    args.push("-to".into());
    args.push(format!("{end:.3}"));
  }
}

// Best-effort cleanup for temp artifacts created during native processing.
pub fn cleanup_file(path: &Path) {
  for _ in 0..6 {
    match std::fs::remove_file(path) {
      Ok(_) => return,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
      Err(_) => std::thread::sleep(Duration::from_millis(120))
    }
  }
}

// Builds a temp video path next to the output for muxing.
pub fn build_temp_video_path(output_path: &str, format: &str, tag: &str) -> PathBuf {
  let output = PathBuf::from(output_path);
  let stem = output
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("native");
  let clean_format = format
    .trim()
    .trim_start_matches('.')
    .to_lowercase();
  let extension = if clean_format.is_empty() {
    "mp4".to_string()
  } else {
    clean_format
  };
  let safe_tag = tag.replace(|c: char| !c.is_ascii_alphanumeric(), "-");
  let file_name = format!("{stem}.{safe_tag}.video.{extension}");
  output.with_file_name(file_name)
}

pub fn build_decode_args(
  input_path: &str,
  width: u32,
  height: u32,
  trim: Option<(f64, f64)>,
  pixel_format: &str
) -> Vec<String> {
  let mut args = vec![
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-i".into(),
    input_path.into()
  ];
  push_trim_args(&mut args, trim);
  args.extend([
    "-map".into(),
    "0:v:0".into(),
    "-an".into(),
    "-vf".into(),
    format!("scale={width}:{height},setsar=1"),
    "-f".into(),
    "rawvideo".into(),
    "-pix_fmt".into(),
    pixel_format.into(),
    "-".into()
  ]);
  args
}

pub fn build_encode_args(
  width: u32,
  height: u32,
  fps: f64,
  encoding: &NativeEncoding,
  output_path: &PathBuf,
  pixel_format: &str
) -> Vec<String> {
  let format = encoding
    .format
    .trim()
    .trim_start_matches('.')
    .to_lowercase();
  let mut args = vec![
    "-y".into(),
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-f".into(),
    "rawvideo".into(),
    "-pix_fmt".into(),
    pixel_format.into(),
    "-s".into(),
    format!("{width}x{height}"),
    "-r".into(),
    format!("{fps:.3}"),
    "-i".into(),
    "-".into()
  ];

  if encoding.encoder == "h264_nvenc" {
    let cq = encoding.cq.unwrap_or(19);
    args.extend([
      "-c:v".into(),
      "h264_nvenc".into(),
      "-preset".into(),
      encoding.preset.clone(),
      "-rc".into(),
      "vbr".into(),
      "-cq".into(),
      cq.to_string(),
      "-b:v".into(),
      "0".into()
    ]);
  } else if encoding.encoder == "libvpx-vp9" {
    let deadline = encoding
      .vp9_deadline
      .clone()
      .unwrap_or_else(|| "good".into());
    let cpu_used = encoding.vp9_cpu_used.unwrap_or(4);
    args.extend([
      "-c:v".into(),
      "libvpx-vp9".into(),
      "-deadline".into(),
      deadline,
      "-cpu-used".into(),
      cpu_used.to_string(),
      "-row-mt".into(),
      "1".into()
    ]);
    if let Some(target_bitrate) = encoding.target_bitrate_kbps {
      args.extend(["-b:v".into(), format!("{target_bitrate}k")]);
    } else {
      let crf = encoding.crf.unwrap_or(30);
      args.extend(["-crf".into(), crf.to_string(), "-b:v".into(), "0".into()]);
    }
  } else {
    let crf = encoding.crf.unwrap_or(20);
    args.extend([
      "-c:v".into(),
      "libx264".into(),
      "-preset".into(),
      encoding.preset.clone(),
      "-crf".into(),
      crf.to_string()
    ]);
  }

  if let Some(max_bitrate) = encoding.max_bitrate_kbps {
    if encoding.encoder == "libvpx-vp9" {
      // VP9 uses either a target bitrate or CRF with b:v=0. Adding VBV caps causes encoder errors.
    } else {
      // Apply a VBV cap to avoid runaway file sizes on high-variance frames.
      let maxrate = max_bitrate.max(1200);
      let bufsize = maxrate.saturating_mul(2);
      args.extend([
        "-maxrate".into(),
        format!("{maxrate}k"),
        "-bufsize".into(),
        format!("{bufsize}k")
      ]);
    }
  }

  if format == "mp4" || format == "m4v" || format == "mov" {
    args.extend(["-movflags".into(), "+faststart".into()]);
  }

  args.extend(["-pix_fmt".into(), "yuv420p".into()]);
  if !encoding.extra_encode_args.is_empty() {
    args.extend(encoding.extra_encode_args.iter().cloned());
  }
  args.push(output_path.to_string_lossy().into_owned());

  args
}

pub fn build_mux_args(
  temp_video: &PathBuf,
  input_path: &str,
  output_path: &str,
  trim: Option<(f64, f64)>,
  encoding: &NativeEncoding
) -> Vec<String> {
  let mut args = vec![
    "-y".into(),
    "-hide_banner".into(),
    "-loglevel".into(),
    "error".into(),
    "-i".into(),
    temp_video.to_string_lossy().into_owned()
  ];
  push_trim_args(&mut args, trim);

  if encoding.audio_enabled {
    args.extend([
      "-i".into(),
      input_path.into(),
      "-map".into(),
      "0:v:0".into(),
      "-map".into(),
      "1:a?".into()
    ]);
  } else {
    args.extend(["-map".into(), "0:v:0".into(), "-an".into()]);
  }

  args.extend(["-c:v".into(), "copy".into()]);
  if encoding.audio_enabled {
    let codec = encoding
      .audio_codec
      .as_deref()
      .unwrap_or("aac")
      .to_lowercase();
    if codec == "opus" {
      args.extend(["-c:a".into(), "libopus".into()]);
    } else if codec == "copy" {
      args.extend(["-c:a".into(), "copy".into()]);
    } else {
      args.extend(["-c:a".into(), "aac".into()]);
    }
    let bitrate = encoding.audio_bitrate_kbps.unwrap_or(192);
    args.extend(["-b:a".into(), format!("{bitrate}k"), "-shortest".into()]);
  }

  let format = encoding
    .format
    .trim()
    .trim_start_matches('.')
    .to_lowercase();
  if format == "mp4" || format == "m4v" || format == "mov" {
    args.extend(["-movflags".into(), "+faststart".into()]);
  }

  if !encoding.extra_mux_args.is_empty() {
    args.extend(encoding.extra_mux_args.iter().cloned());
  }
  args.push(output_path.into());
  args
}

pub async fn run_ffmpeg_output(app: &AppHandle, args: Vec<String>) -> Result<(), String> {
  let output = resolve_ffmpeg_command(app, "ffmpeg")?
    .args(args)
    .output()
    .await
    .map_err(|error| error.to_string())?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(stderr.trim().to_string());
  }
  Ok(())
}
