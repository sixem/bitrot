// Sets up FFmpeg/ffprobe sidecars by copying them from the user's PATH.
// This keeps large binaries out of git while making local setup one command.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const binariesDir = path.join(repoRoot, "src-tauri", "binaries");

const platform = process.platform;
const arch = process.arch;

const getTargetTriple = () => {
  if (platform === "win32" && arch === "x64") {
    return { triple: "x86_64-pc-windows-msvc", ext: ".exe" };
  }
  if (platform === "darwin" && arch === "x64") {
    return { triple: "x86_64-apple-darwin", ext: "" };
  }
  if (platform === "darwin" && arch === "arm64") {
    return { triple: "aarch64-apple-darwin", ext: "" };
  }
  if (platform === "linux" && arch === "x64") {
    return { triple: "x86_64-unknown-linux-gnu", ext: "" };
  }
  if (platform === "linux" && arch === "arm64") {
    return { triple: "aarch64-unknown-linux-gnu", ext: "" };
  }
  return null;
};

const findOnPath = (name) => {
  try {
    const cmd = platform === "win32" ? "where" : "which";
    const output = execSync(`${cmd} ${name}`, {
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return output[0];
  } catch {
    return undefined;
  }
};

const copySidecar = (sourcePath, baseName, triple, ext) => {
  const fileName = `${baseName}-${triple}${ext}`;
  const destPath = path.join(binariesDir, fileName);
  copyFileSync(sourcePath, destPath);
  return destPath;
};

const main = () => {
  const target = getTargetTriple();
  if (!target) {
    console.error(
      `Unsupported platform/arch for sidecar setup: ${platform}/${arch}`
    );
    process.exit(1);
  }

  const ffmpegPath = findOnPath("ffmpeg");
  const ffprobePath = findOnPath("ffprobe");

  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    console.error("Could not find ffmpeg on PATH.");
    console.error("Install FFmpeg and ensure `ffmpeg` resolves in your shell.");
    process.exit(1);
  }

  if (!ffprobePath || !existsSync(ffprobePath)) {
    console.error("Could not find ffprobe on PATH.");
    console.error("Install FFmpeg and ensure `ffprobe` resolves in your shell.");
    process.exit(1);
  }

  mkdirSync(binariesDir, { recursive: true });

  const ffmpegDest = copySidecar(ffmpegPath, "ffmpeg", target.triple, target.ext);
  const ffprobeDest = copySidecar(
    ffprobePath,
    "ffprobe",
    target.triple,
    target.ext
  );

  console.log("FFmpeg sidecars copied:");
  console.log(`- ffmpeg:  ${ffmpegDest}`);
  console.log(`- ffprobe: ${ffprobeDest}`);
};

main();

