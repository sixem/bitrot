mod datamosh;

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
  for path in paths {
    if path.trim().is_empty() {
      continue;
    }
    match std::fs::remove_file(path) {
      Ok(_) => {}
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
      Err(error) => return Err(format!("Failed to delete temp file: {error}")),
    }
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![datamosh_bitstream, cleanup_files])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
