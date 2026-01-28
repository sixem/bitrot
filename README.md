# BitRot ⚡

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)
![Sass](https://img.shields.io/badge/Sass-C69?logo=sass&logoColor=fff)
![Tauri](https://img.shields.io/badge/Tauri-24C8D8?logo=tauri&logoColor=fff)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=fff)

A simple interface for creating glitchy video effects 💫

## Features

- Drag-and-drop video input anywhere in the app
  
- Multiple processing modes:
  - **Analog**: light grit and clarity tweaks
  - **Chroma glitch**: chroma shifts, decay trails, and noise
  - **Datamosh (classic)**: scene-aware I-frame removal
    
- FFmpeg + ffprobe sidecar workflow (works in dev and bundled builds)
  
- Export to web-friendly MP4 (H.264 + AAC)

## Showcase

https://github.com/user-attachments/assets/618222b9-3ff3-4a24-a54b-2bd21c06cd2f

https://github.com/user-attachments/assets/728cb83d-a4bd-40c8-aba1-e150a77f96d0

https://github.com/user-attachments/assets/f8a49356-ca71-4443-aea0-ecc2eb55dcd3

## Development

Prereqs (typical Tauri + Vite stack):

- Node 20.19+ or 22.12+
- pnpm
- Rust (*stable*)
- Tauri system prereqs for your OS or distro

Install and run:

```bash
pnpm install
pnpm tauri dev
```

## Build + portable zip (Windows)

To build a portable zip on Windows:

```bash
pnpm run setup:ffmpeg
pnpm tauri build
pnpm run make:portable
```

## FFmpeg sidecars

This project expects FFmpeg and ffprobe as sidecar binaries.

Place them in:

- `src-tauri/binaries/`

Quick setup (copies from your `PATH`):

```bash
pnpm run setup:ffmpeg
```

FFmpeg is resolved in this order:

1. `ffmpeg(.exe)` / `ffprobe(.exe)` next to the binary (app) executable
2. Sidecars in `binaries/` (packaged into app resources)
3. System `PATH` as a final fallback

For development and building, use names that match your platform target triple:

- Windows (x64 MSVC):
  - `ffmpeg-x86_64-pc-windows-msvc.exe`
  - `ffprobe-x86_64-pc-windows-msvc.exe`
  
- macOS (Intel):
  - `ffmpeg-x86_64-apple-darwin`
  - `ffprobe-x86_64-apple-darwin`
  
- Linux (x64 GNU):
  - `ffmpeg-x86_64-unknown-linux-gnu`
  - `ffprobe-x86_64-unknown-linux-gnu`

Tauri resolves these from the base names `binaries/ffmpeg` and `binaries/ffprobe`.

## Notes

Some files include multiple video tracks; BitRot always targets the first video stream plus the first audio stream (if present).

H.264 requires even dimensions. If a clip is odd-sized (for example 1921x1081), BitRot trims a single pixel to keep encoders happy.

Datamoshing is *intentionally* destructive. Not every input will behave perfectly, and some videos may work better than others for certain effects.
