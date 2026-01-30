# BitRot

_BitRot (/ˈbɪt.rɒt/_ noun) — A simple interface for creating glitchy video effects

<img width="1400" height="800" alt="ui" src="https://github.com/user-attachments/assets/58f04ac8-944e-41f3-9f23-0895091a2f3e" />

## Showcase

**Pixelsort**: Smears and reorders pixels along lines or bands, turning motion and edges into streaky, glitchy gradients.

<details>
  <summary>Show example</summary>
  <video src="https://github.com/user-attachments/assets/618222b9-3ff3-4a24-a54b-2bd21c06cd2f" controls></video>
</details>

**Chroma Glitch**: Splits and offsets color channels to create RGB drift, halos, and jittery color separation.

<details>
  <summary>Show example</summary>
  <video src="https://github.com/user-attachments/assets/728cb83d-a4bd-40c8-aba1-e150a77f96d0" controls></video>
</details>

**Datamosh**: Emulates compression corruption and motion‑vector bleed for fluid, melting transitions between frames.

<details>
  <summary>Show example</summary>
  <video src="https://github.com/user-attachments/assets/f8a49356-ca71-4443-aea0-ecc2eb55dcd3" controls></video>
</details>

**VHS**: Adds retro tape artifacts/scanlines, noise, wobble, and soft tracking drift, for that worn‑out analog feel.

<details>
  <summary>Show example</summary>
  <video src="https://github.com/user-attachments/assets/265b34e6-d30d-481c-b1c0-d395eb5c4d3c" controls></video>
</details>

## Development

Prereqs (typical Tauri + Vite stack):

- Node 20.19+/22.12+
- pnpm
- Rust (_stable_)
- Tauri system prereqs for your OS/distro

Install and run:

```bash
# install packages
pnpm install
# if you need to load the ffmpeg/ffprobe binaries from PATH:
pnpm run setup:ffmpeg
# start development environment
pnpm tauri dev
```

### Tests

Frontend tests (Vitest):

```bash
pnpm test
```

Rust tests:

```bash
cd src-tauri
cargo test
```

See [TEST_OUTLINE.md](/TEST_OUTLINE.md) for coverage details.

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

1. `ffmpeg(.exe)` / `ffprobe(.exe)` next to the app executable (packaged builds)
2. Sidecars in `binaries/` (packaged into app resources) or `src-tauri/binaries/` (dev)
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

Datamoshing is intentionally destructive. Not every input will behave perfectly, and some videos may work better than others for certain effects.
