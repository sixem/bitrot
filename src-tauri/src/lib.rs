mod datamosh;
mod ffmpeg;
mod ffmpeg_jobs;
mod pixelsort;

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
fn cleanup_files(paths: Vec<String>) -> Result<(), String> {
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

  #[cfg(windows)]
  {
    let mut command = std::process::Command::new("explorer");
    if is_dir {
      command.arg(&path_buf);
    } else {
      command.arg(format!("/select,{}", path_buf.display()));
    }
    let status = command
      .status()
      .map_err(|error| format!("Failed to open Explorer: {error}"))?;
    if status.success() {
      return Ok(());
    }
    return Err("Explorer failed to open the path.".to_string());
  }

  #[cfg(target_os = "macos")]
  {
    let mut command = std::process::Command::new("open");
    if is_dir {
      command.arg(&path_buf);
    } else {
      command.arg("-R").arg(&path_buf);
    }
    let status = command
      .status()
      .map_err(|error| format!("Failed to open Finder: {error}"))?;
    if status.success() {
      return Ok(());
    }
    return Err("Finder failed to open the path.".to_string());
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let folder = if is_dir {
      path_buf.clone()
    } else {
      path_buf
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
    };
    let status = std::process::Command::new("xdg-open")
      .arg(&folder)
      .status()
      .map_err(|error| format!("Failed to open file manager: {error}"))?;
    if status.success() {
      return Ok(());
    }
    return Err("File manager failed to open the folder.".to_string());
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(pixelsort::PixelsortJobs::default())
    .manage(ffmpeg_jobs::FfmpegJobs::default())
    .invoke_handler(tauri::generate_handler![
      datamosh_bitstream,
      ffmpeg_jobs::ffmpeg_execute,
      ffmpeg_jobs::ffmpeg_spawn,
      ffmpeg_jobs::ffmpeg_kill,
      cleanup_files,
      get_executable_dir,
      executable_file_exists,
      path_exists,
      reveal_in_folder,
      pixelsort::pixelsort_process,
      pixelsort::pixelsort_cancel,
      pixelsort::pixelsort_preview
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
