# Test Outline

This document summarizes the lightweight tests added to cover the pipeline helpers
and datamosh bitstream behavior.

## JavaScript (Vitest)

- `src/jobs/ffmpegArgs.test.ts`
  - Verifies `SAFE_SCALE_FILTER` matches the expected even-dimension filter.
  - Ensures `buildAudioArgs` selects AAC for mp4/m4v and copy for other containers.
  - Ensures `buildContainerArgs` adds `+faststart` only for mp4/m4v outputs.
  - Verifies `getExtension` normalizes and extracts extensions reliably.

- `src/system/path.test.ts`
  - Confirms `sanitizePath` trims whitespace and strips surrounding quotes.
  - Confirms clean paths are returned unchanged.

## Rust

- `src-tauri/src/datamosh.rs` (module tests)
  - `datamosh_preserves_headers_and_first_intra_vop`: headers are kept and the
    first intra VOP is always preserved even when drop intensity is 100%.
  - `datamosh_errors_without_start_codes`: returns the expected error when no
    MPEG-4 start codes are present.
  - `datamosh_errors_without_vops`: returns the expected error when no VOP
    frames exist in the bitstream.

## Running tests

- Frontend: `pnpm test`
- Rust: `cd src-tauri && cargo test`
