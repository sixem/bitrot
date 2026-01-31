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

// Let CI/local scripts pin explicit binaries when PATH points at shims.
const resolveEnvOverride = (envKey) => {
  const raw = process.env[envKey];
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!existsSync(trimmed)) {
    console.warn(`${envKey} was set but does not exist: ${trimmed}`);
    return undefined;
  }
  return trimmed;
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
    return output;
  } catch {
    return [];
  }
};

// Prefer real binaries over package-manager shims to avoid broken MSI sidecars.
const isWindowsShim = (candidate) => {
  const normalized = candidate.toLowerCase();
  return (
    normalized.includes("\\chocolatey\\bin\\") ||
    normalized.includes("\\scoop\\shims\\")
  );
};

const resolveChocolateyBinary = (program) => {
  const programData = process.env.ProgramData || "C:\\ProgramData";
  const root = path.join(programData, "chocolatey", "lib", "ffmpeg", "tools");
  const candidates = [
    path.join(root, `${program}.exe`),
    path.join(root, "ffmpeg", "bin", `${program}.exe`),
    path.join(root, "bin", `${program}.exe`)
  ];
  return candidates.find((candidate) => existsSync(candidate));
};

const resolveScoopBinary = (program, shimPath) => {
  const normalized = shimPath.toLowerCase();
  const shimMarker = "\\scoop\\shims\\";
  const index = normalized.indexOf(shimMarker);
  if (index === -1) {
    return undefined;
  }
  const root = shimPath.slice(0, index + "\\scoop".length);
  const candidate = path.join(
    root,
    "apps",
    "ffmpeg",
    "current",
    "bin",
    `${program}.exe`
  );
  if (existsSync(candidate)) {
    return candidate;
  }
  return undefined;
};

const resolveWindowsBinary = (program, candidates) => {
  const nonShim = candidates.find((candidate) => !isWindowsShim(candidate));
  if (nonShim) {
    return nonShim;
  }
  for (const candidate of candidates) {
    if (candidate.toLowerCase().includes("\\chocolatey\\bin\\")) {
      const resolved = resolveChocolateyBinary(program);
      if (resolved) {
        return resolved;
      }
    }
    if (candidate.toLowerCase().includes("\\scoop\\shims\\")) {
      const resolved = resolveScoopBinary(program, candidate);
      if (resolved) {
        return resolved;
      }
    }
  }
  return candidates[0];
};

const resolveBinaryPath = (program) => {
  const envKey = program === "ffmpeg" ? "FFMPEG_BIN" : "FFPROBE_BIN";
  const envPath = resolveEnvOverride(envKey);
  if (envPath) {
    return envPath;
  }
  const candidates = findOnPath(program);
  if (candidates.length === 0) {
    return undefined;
  }
  if (platform === "win32") {
    return resolveWindowsBinary(program, candidates);
  }
  return candidates[0];
};

const copySidecar = (sourcePath, fileName) => {
  const destPath = path.join(binariesDir, fileName);
  copyFileSync(sourcePath, destPath);
  return destPath;
};

const copyWithBothNames = (sourcePath, baseName, triple, ext) => {
  const tripleName = `${baseName}-${triple}${ext}`;
  const baseNameWithExt = `${baseName}${ext}`;
  const triplePath = copySidecar(sourcePath, tripleName);
  const basePath = copySidecar(sourcePath, baseNameWithExt);
  return { triplePath, basePath };
};

const main = () => {
  const target = getTargetTriple();
  if (!target) {
    console.error(
      `Unsupported platform/arch for sidecar setup: ${platform}/${arch}`
    );
    process.exit(1);
  }

  const ffmpegPath = resolveBinaryPath("ffmpeg");
  const ffprobePath = resolveBinaryPath("ffprobe");

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

  console.log(`Using ffmpeg binary: ${ffmpegPath}`);
  console.log(`Using ffprobe binary: ${ffprobePath}`);

  const ffmpegDest = copyWithBothNames(
    ffmpegPath,
    "ffmpeg",
    target.triple,
    target.ext
  );
  const ffprobeDest = copyWithBothNames(
    ffprobePath,
    "ffprobe",
    target.triple,
    target.ext
  );

  console.log("FFmpeg sidecars copied:");
  console.log(`- ffmpeg (triple): ${ffmpegDest.triplePath}`);
  console.log(`- ffmpeg (base):   ${ffmpegDest.basePath}`);
  console.log(`- ffprobe (triple): ${ffprobeDest.triplePath}`);
  console.log(`- ffprobe (base):   ${ffprobeDest.basePath}`);
};

main();
