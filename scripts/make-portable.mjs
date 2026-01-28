// Builds a portable folder + zip that includes the app and FFmpeg sidecars.
// This is Windows-focused but still creates the portable folder cross-platform.
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
const releaseDir = path.join(repoRoot, "src-tauri", "target", "release");
const binariesDir = path.join(repoRoot, "src-tauri", "binaries");
const portableDir = path.join(repoRoot, "portable");
const portableBinDir = path.join(portableDir, "binaries");
const portableZipPath = path.join(repoRoot, "portable.zip");
const portableResourcesDir = path.join(portableDir, "resources");
const portableResourcesBinDir = path.join(portableResourcesDir, "binaries");

const platform = process.platform;
const arch = process.arch;
const isWindows = platform === "win32";
const exeExt = isWindows ? ".exe" : "";

const readCrateName = () => {
  const raw = readFileSync(cargoTomlPath, "utf8");
  const match = raw.match(/^\s*name\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error("Could not determine crate name from src-tauri/Cargo.toml");
  }
  return match[1];
};

const getHostTriple = () => {
  const override = process.env.TARGET_TRIPLE?.trim();
  if (override) {
    return override;
  }
  try {
    return execSync("rustc --print host-tuple", {
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
  } catch {
    // Fallback to a best-effort mapping when rustc is not on PATH.
    if (platform === "win32" && arch === "x64") {
      return "x86_64-pc-windows-msvc";
    }
    if (platform === "darwin" && arch === "x64") {
      return "x86_64-apple-darwin";
    }
    if (platform === "darwin" && arch === "arm64") {
      return "aarch64-apple-darwin";
    }
    if (platform === "linux" && arch === "x64") {
      return "x86_64-unknown-linux-gnu";
    }
    if (platform === "linux" && arch === "arm64") {
      return "aarch64-unknown-linux-gnu";
    }
    throw new Error(
      "Could not determine host target triple. Install Rust or set TARGET_TRIPLE."
    );
  }
};

const ensureExists = (filePath, hint) => {
  if (!existsSync(filePath)) {
    throw new Error(`${filePath} is missing. ${hint}`);
  }
};

const copySidecar = (baseName, triple, destDir) => {
  const fileName = `${baseName}-${triple}${exeExt}`;
  const sourcePath = path.join(binariesDir, fileName);
  const destPath = path.join(destDir, fileName);
  ensureExists(
    sourcePath,
    "Run `pnpm run setup:ffmpeg` (and ensure ffmpeg/ffprobe are on PATH)."
  );
  copyFileSync(sourcePath, destPath);
  return destPath;
};

const copyLocalBinary = (baseName, triple) => {
  const fileName = `${baseName}-${triple}${exeExt}`;
  const sourcePath = path.join(binariesDir, fileName);
  const destPath = path.join(portableDir, `${baseName}${exeExt}`);
  ensureExists(
    sourcePath,
    "Run `pnpm run setup:ffmpeg` (and ensure ffmpeg/ffprobe are on PATH)."
  );
  copyFileSync(sourcePath, destPath);
  return destPath;
};

const zipPortableOnWindows = () => {
  try {
    if (existsSync(portableZipPath)) {
      rmSync(portableZipPath, { force: true });
    }
    const command = [
      "powershell",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path "${portableDir}\\*" -DestinationPath "${portableZipPath}" -Force`
    ].join(" ");
    execSync(command, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
};

const main = () => {
  const crateName = readCrateName();
  const triple = getHostTriple();
  const exeName = `${crateName}${exeExt}`;
  const exeSourcePath = path.join(releaseDir, exeName);
  const exeDestPath = path.join(portableDir, exeName);

  ensureExists(
    exeSourcePath,
    "Build first with `pnpm tauri build --bundles none`."
  );

  rmSync(portableDir, { recursive: true, force: true });
  mkdirSync(portableBinDir, { recursive: true });
  mkdirSync(portableResourcesBinDir, { recursive: true });

  copyFileSync(exeSourcePath, exeDestPath);
  const ffmpegDest = copySidecar("ffmpeg", triple, portableBinDir);
  const ffprobeDest = copySidecar("ffprobe", triple, portableBinDir);
  const ffmpegResourceDest = copySidecar("ffmpeg", triple, portableResourcesBinDir);
  const ffprobeResourceDest = copySidecar("ffprobe", triple, portableResourcesBinDir);
  // Keep local copies next to the executable so local resolution wins.
  const ffmpegLocalDest = copyLocalBinary("ffmpeg", triple);
  const ffprobeLocalDest = copyLocalBinary("ffprobe", triple);

  console.log("Portable folder created:");
  console.log(`- app:     ${exeDestPath}`);
  console.log(`- ffmpeg (sidecar):   ${ffmpegDest}`);
  console.log(`- ffprobe (sidecar):  ${ffprobeDest}`);
  console.log(`- ffmpeg (resources): ${ffmpegResourceDest}`);
  console.log(`- ffprobe (resources): ${ffprobeResourceDest}`);
  console.log(`- ffmpeg (local):     ${ffmpegLocalDest}`);
  console.log(`- ffprobe (local):    ${ffprobeLocalDest}`);

  if (isWindows) {
    const zipped = zipPortableOnWindows();
    if (zipped) {
      console.log(`Portable zip created: ${portableZipPath}`);
    } else {
      console.log("Portable folder created, but zipping failed. Zip it manually.");
    }
  } else {
    console.log("Portable folder created. Zip it manually for distribution.");
  }
};

main();
