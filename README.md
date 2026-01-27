# BitRot

A simple interface for creating glitch-like video effects.

## Features

- Drag-and-drop video input anywhere in the app
- Multiple processing modes:
  - Analog: light grit and clarity tweaks
  - Chroma glitch: chroma shifts, decay trails, and noise
  - Datamosh (classic): scene-aware I-frame removal
- FFmpeg + ffprobe sidecar workflow (works in dev and bundled builds)
- Export to web-friendly MP4 (H.264 + AAC)

## Showcase

https://github.com/user-attachments/assets/728cb83d-a4bd-40c8-aba1-e150a77f96d0

https://github.com/user-attachments/assets/f8a49356-ca71-4443-aea0-ecc2eb55dcd3

## Development

Prerequisites (typical Tauri stack):

- Node.js 20+
- pnpm
- Rust (stable)
- Tauri system prerequisites for your OS

Install and run:

```bash
pnpm install
pnpm tauri dev
```

## ffmpeg sidecars

This project expects ffmpeg and ffprobe as sidecar binaries.

Place them in:

- `src-tauri/binaries/`

Quick setup (copies from your PATH):

```bash
pnpm run setup:ffmpeg
```

Use names that match your platform target triple:

- Windows (x64 MSVC):
  - `ffmpeg-x86_64-pc-windows-msvc.exe`
  - `ffprobe-x86_64-pc-windows-msvc.exe`
  
- macOS (Intel):
  - `ffmpeg-x86_64-apple-darwin`
  - `ffprobe-x86_64-apple-darwin`
  
- Linux (x64 GNU):
  - `ffmpeg-x86_64-unknown-linux-gnu`
  - `ffprobe-x86_64-unknown-linux-gnu`

Tauri resolves these from the base names `binaries/ffmpeg` and
`binaries/ffprobe`.

## Notes

- Some files include multiple video tracks; BitRot always targets the first
  video stream plus the first audio stream (if present).
- H.264 requires even dimensions. If a clip is odd-sized (for example
  1921x1081), BitRot trims a single pixel to keep encoders happy.
- Datamoshing is intentionally destructive. Not every input will behave
  perfectly, but the export step aims to remain playable in modern players.
