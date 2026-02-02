mod ffmpeg;
mod modes;
mod native;

use ffmpeg::{frames as ffprobe_frames, jobs as ffmpeg_jobs};
use modes::{block_shift, byte_range, datamosh, kaleidoscope, pixelsort, vaporwave};
use native::preview as native_preview;

use std::path::{Path, PathBuf};

#[tauri::command]
fn datamosh_bitstream(
  input_path: String,
  output_path: String,
  fps: f64,
  windows: Vec<datamosh::SceneWindow>,
  intensity: f64,
  seed: u64,
  extradata_hex: Option<String>,
) -> Result<(), String> {
  datamosh::process_datamosh(
    &input_path,
    &output_path,
    fps,
    &windows,
    intensity,
    seed,
    extradata_hex.as_deref(),
  )
}

#[tauri::command]
async fn cleanup_files(paths: Vec<String>) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    let mut failures = Vec::new();
    for path in paths {
      if path.trim().is_empty() {
        continue;
      }
      let mut removed = false;
      for _ in 0..6 {
        match std::fs::remove_file(&path) {
          Ok(_) => {
            removed = true;
            break;
          }
          Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            removed = true;
            break;
          }
          Err(_) => {
            std::thread::sleep(std::time::Duration::from_millis(120));
          }
        }
      }
      if !removed {
        failures.push(path);
      }
    }
    if failures.is_empty() {
      Ok(())
    } else {
      Err(format!(
        "Failed to delete temp files: {}",
        failures.join(", ")
      ))
    }
  })
  .await
  .map_err(|error| format!("cleanup join failed: {error}"))?
}

#[tauri::command]
fn get_executable_dir() -> Result<String, String> {
  let exe = std::env::current_exe().map_err(|error| format!("current_exe: {error}"))?;
  let dir = exe
    .parent()
    .ok_or_else(|| "Executable has no parent directory".to_string())?;
  Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn executable_file_exists(name: String) -> Result<bool, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Ok(false);
  }
  let dir = get_executable_dir()?;
  let path = std::path::Path::new(&dir).join(trimmed);
  Ok(path.exists())
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Ok(false);
  }
  Ok(Path::new(trimmed).exists())
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is empty.".to_string());
  }
  let path_buf = PathBuf::from(trimmed);
  if !path_buf.exists() {
    return Err("Path does not exist.".to_string());
  }
  let is_dir = path_buf.is_dir();
  let folder = if is_dir {
    path_buf.clone()
  } else {
    path_buf
      .parent()
      .map(Path::to_path_buf)
      .ok_or_else(|| "Path has no parent directory.".to_string())?
  };

  #[cfg(windows)]
  {
    let mut command = std::process::Command::new("explorer");
    command.arg(&folder);
    command
      .spawn()
      .map_err(|error| format!("Failed to open Explorer: {error}"))?;
    return Ok(());
  }

  #[cfg(target_os = "macos")]
  {
    let mut command = std::process::Command::new("open");
    command.arg(&folder);
    command
      .spawn()
      .map_err(|error| format!("Failed to open Finder: {error}"))?;
    return Ok(());
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(&folder)
      .spawn()
      .map_err(|error| format!("Failed to open file manager: {error}"))?;
    return Ok(());
  }
}

#[tauri::command]
fn file_size(path: String) -> Result<u64, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is empty.".to_string());
  }
  let metadata =
    std::fs::metadata(trimmed).map_err(|error| format!("metadata: {error}"))?;
  if !metadata.is_file() {
    return Err("Path is not a file.".to_string());
  }
  Ok(metadata.len())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(pixelsort::jobs::PixelsortJobs::default())
    .manage(byte_range::ModuloMappingJobs::default())
    .manage(block_shift::BlockShiftJobs::default())
    .manage(vaporwave::VaporwaveJobs::default())
    .manage(kaleidoscope::KaleidoscopeJobs::default())
    .manage(native_preview::PreviewBuffers::default())
    .manage(ffmpeg_jobs::FfmpegJobs::default())
    .invoke_handler(tauri::generate_handler![
      datamosh_bitstream,
      ffmpeg_jobs::ffmpeg_execute,
      ffmpeg_jobs::ffmpeg_spawn,
      ffmpeg_jobs::ffmpeg_kill,
      ffprobe_frames::ffprobe_frame_map,
      cleanup_files,
      get_executable_dir,
      executable_file_exists,
      path_exists,
      reveal_in_folder,
      file_size,
      byte_range::modulo_mapping_process,
      byte_range::modulo_mapping_cancel,
      byte_range::modulo_mapping_preview_start,
      byte_range::modulo_mapping_preview_append,
      byte_range::modulo_mapping_preview_finish,
      byte_range::modulo_mapping_preview_discard,
      block_shift::block_shift_process,
      block_shift::block_shift_cancel,
      block_shift::block_shift_preview_start,
      block_shift::block_shift_preview_append,
      block_shift::block_shift_preview_finish,
      block_shift::block_shift_preview_discard,
      kaleidoscope::kaleidoscope_process,
      kaleidoscope::kaleidoscope_cancel,
      kaleidoscope::kaleidoscope_preview_start,
      kaleidoscope::kaleidoscope_preview_append,
      kaleidoscope::kaleidoscope_preview_finish,
      kaleidoscope::kaleidoscope_preview_discard,
      vaporwave::vaporwave_process,
      vaporwave::vaporwave_cancel,
      vaporwave::vaporwave_preview_start,
      vaporwave::vaporwave_preview_append,
      vaporwave::vaporwave_preview_finish,
      vaporwave::vaporwave_preview_discard,
      pixelsort::jobs::pixelsort_process,
      pixelsort::jobs::pixelsort_cancel,
      pixelsort::preview::pixelsort_preview_start,
      pixelsort::preview::pixelsort_preview_append,
      pixelsort::preview::pixelsort_preview_finish,
      pixelsort::preview::pixelsort_preview_discard
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
