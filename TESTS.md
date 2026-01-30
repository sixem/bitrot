# Test Outline

This document summarizes the lightweight tests added to cover the pipeline helpers
and datamosh bitstream behavior.

## JavaScript (Vitest)

- `src/jobs/ffmpegArgs.test.ts`
  - Verifies `SAFE_SCALE_FILTER` matches the expected even-dimension filter.
  - Ensures `buildAudioArgs` selects AAC for mp4/m4v/mov and Opus for webm.
  - Ensures `buildAudioArgs` selects AAC for mkv outputs.
  - Ensures `buildContainerArgs` adds `+faststart` only for mp4/m4v/mov outputs.
  - Verifies `getExtension` normalizes and extracts extensions reliably.
  - Verifies `parseExtraArgs` keeps only safe flags and preserves quoted values.

- `src/jobs/exportEncoding.test.ts`
  - Checks deterministic bitrate cap estimates.
  - Verifies encoder arg construction for libx264, NVENC, and VP9 (including pass args).

- `src/jobs/nativeEncoding.test.ts`
  - Verifies safe extra args split between native encode and mux steps.
  - Confirms audio defaults for webm outputs.

- `src/jobs/nativeVideo.test.ts`
  - Checks native FPS resolution rules.
  - Confirms odd dimension normalization.

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
  - `datamosh_prepends_extradata_prefix`: prepends extradata with a start code.
  - `datamosh_drops_intra_frames_only_inside_windows`: drops I-frames only
    inside the active window.

## Running tests

- Frontend: `pnpm test`
- Rust: `cd src-tauri && cargo test`
