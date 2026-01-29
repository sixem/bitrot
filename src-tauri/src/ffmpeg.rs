use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::{process::Command, ShellExt};

// Shared FFmpeg resolution for all Rust-side pipelines.
// Order: executable dir -> sidecar binaries dir -> system PATH.

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandSource {
  Local,
  Sidecar,
  Path
}

pub struct ResolvedCommand {
  pub command: Command,
  pub source: CommandSource
}

fn executable_dir() -> Option<PathBuf> {
  let exe = std::env::current_exe().ok()?;
  exe.parent().map(Path::to_path_buf)
}

fn with_platform_suffix(program: &str) -> String {
  if cfg!(windows) && !program.to_lowercase().ends_with(".exe") {
    format!("{program}.exe")
  } else {
    program.to_string()
  }
}

fn local_binary_dir(program: &str) -> Option<PathBuf> {
  let dir = executable_dir()?;
  let candidate = dir.join(with_platform_suffix(program));
  if candidate.exists() {
    Some(dir)
  } else {
    None
  }
}

// Keep these in sync with scripts/setup-ffmpeg.mjs and scripts/make-portable.mjs.
fn target_triple() -> Option<&'static str> {
  if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
    Some("x86_64-pc-windows-msvc")
  } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    Some("x86_64-apple-darwin")
  } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    Some("aarch64-apple-darwin")
  } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    Some("x86_64-unknown-linux-gnu")
  } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
    Some("aarch64-unknown-linux-gnu")
  } else {
    None
  }
}

fn triple_sidecar_name(program: &str) -> Option<String> {
  let triple = target_triple()?;
  Some(with_platform_suffix(&format!("{program}-{triple}")))
}

// Resolve the dev-time `src-tauri/binaries` location when running via cargo/tauri dev.
fn dev_binaries_dir() -> Option<PathBuf> {
  let cwd = std::env::current_dir().ok()?;
  if cwd.join("tauri.conf.json").exists() {
    return Some(cwd.join("binaries"));
  }
  let src_tauri = cwd.join("src-tauri");
  if src_tauri.join("tauri.conf.json").exists() {
    return Some(src_tauri.join("binaries"));
  }
  None
}

fn check_binaries_dir(
  dir: PathBuf,
  base_name: &str,
  triple_name: Option<&str>
) -> Option<PathBuf> {
  let base_path = dir.join(base_name);
  if base_path.exists() {
    return Some(base_path);
  }
  let triple_name = triple_name?;
  let triple_path = dir.join(triple_name);
  if triple_path.exists() {
    return Some(triple_path);
  }
  None
}

fn sidecar_binary_path(program: &str) -> Option<PathBuf> {
  let base_name = with_platform_suffix(program);
  let triple_name = triple_sidecar_name(program);

  if let Some(exe_dir) = executable_dir() {
    let dir = exe_dir.join("binaries");
    if let Some(path) = check_binaries_dir(dir, &base_name, triple_name.as_deref()) {
      return Some(path);
    }
  }

  if let Some(dev_dir) = dev_binaries_dir() {
    if let Some(path) = check_binaries_dir(dev_dir, &base_name, triple_name.as_deref()) {
      return Some(path);
    }
  }

  None
}

fn path_delimiter() -> char {
  if cfg!(windows) {
    ';'
  } else {
    ':'
  }
}

fn build_local_command(app: &AppHandle, program: &str, dir: &Path) -> Command {
  let delimiter = path_delimiter();
  let existing = std::env::var("PATH").unwrap_or_default();
  let path_value = if existing.is_empty() {
    dir.to_string_lossy().into_owned()
  } else {
    format!("{}{}{}", dir.to_string_lossy(), delimiter, existing)
  };
  app
    .shell()
    .command(program)
    .current_dir(dir)
    .env("PATH", path_value)
}

pub fn resolve_ffmpeg_command_with_source(
  app: &AppHandle,
  program: &str
) -> Result<ResolvedCommand, String> {
  if let Some(dir) = local_binary_dir(program) {
    return Ok(ResolvedCommand {
      command: build_local_command(app, program, dir.as_path()),
      source: CommandSource::Local
    });
  }
  if let Some(path) = sidecar_binary_path(program) {
    return Ok(ResolvedCommand {
      command: app.shell().command(path),
      source: CommandSource::Sidecar
    });
  }
  Ok(ResolvedCommand {
    command: app.shell().command(program),
    source: CommandSource::Path
  })
}

pub fn resolve_ffmpeg_command(app: &AppHandle, program: &str) -> Result<Command, String> {
  Ok(resolve_ffmpeg_command_with_source(app, program)?.command)
}
