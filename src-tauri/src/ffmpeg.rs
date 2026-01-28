use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::{process::Command, ShellExt};

// Shared FFmpeg resolution for all Rust-side pipelines.
// Order: executable dir -> bundled sidecar -> system PATH.

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

fn sidecar_exists(program: &str) -> bool {
  let dir = match executable_dir() {
    Some(dir) => dir,
    None => return false
  };
  let candidate = dir
    .join("binaries")
    .join(with_platform_suffix(program));
  candidate.exists()
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
  if sidecar_exists(program) {
    return app
      .shell()
      .sidecar(format!("binaries/{program}"))
      .map(|command| ResolvedCommand {
        command,
        source: CommandSource::Sidecar
      })
      .map_err(|error| error.to_string());
  }
  Ok(ResolvedCommand {
    command: app.shell().command(program),
    source: CommandSource::Path
  })
}

pub fn resolve_ffmpeg_command(app: &AppHandle, program: &str) -> Result<Command, String> {
  Ok(resolve_ffmpeg_command_with_source(app, program)?.command)
}
