// Datamosh pipeline: normalize to MPEG-4, detect cuts, then drop intra VOPs.
import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import type { VideoAsset } from "@/domain/video";
import { createFfmpegProgressParser } from "@/jobs/ffmpegProgress";
import { joinOutputPath, splitOutputPath } from "@/jobs/output";
import type { JobProgress } from "@/jobs/types";
import type { DatamoshConfig } from "@/modes/datamosh";
import { probeVideo, probeVideoExtradata } from "@/system/ffprobe";
import makeDebug from "@/utils/debug";

type DatamoshCallbacks = {
  onProgress: (progress: JobProgress) => void;
  onLog: (line: string) => void;
  onClose: (code: number | null, signal: string | null) => void;
  onError: (message: string) => void;
};

export type DatamoshRunHandle = {
  outputPath: string;
  cancel: () => Promise<void>;
};

const FFMPEG_SIDECAR = "binaries/ffmpeg";
const debug = makeDebug("jobs:datamosh");

const sanitizePath = (value: string) => value.trim().replace(/^"+|"+$/g, "");
// libx264 requires even dimensions; we trim odd pixels safely.
const SAFE_SCALE_FILTER = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1";
const MIN_GOP_SIZE = 30;
const MAX_GOP_SIZE = 600;

const getExtension = (path: string) => {
  const clean = path.trim().toLowerCase();
  const dotIndex = clean.lastIndexOf(".");
  return dotIndex >= 0 ? clean.slice(dotIndex + 1) : "";
};

const buildAudioArgs = (outputPath: string) => {
  const extension = getExtension(outputPath);
  if (extension === "mp4" || extension === "m4v") {
    return ["-c:a", "aac", "-b:a", "192k"];
  }
  return ["-c:a", "copy"];
};

const buildContainerArgs = (outputPath: string) => {
  const extension = getExtension(outputPath);
  return extension === "mp4" || extension === "m4v"
    ? ["-movflags", "+faststart"]
    : [];
};

const ensureDatamoshContainer = (outputPath: string) => {
  const extension = getExtension(outputPath);
  if (extension === "mp4" || extension === "m4v" || extension === "mkv") {
    return;
  }
  throw new Error(
    `Datamosh output must be .mp4 or .mkv (got .${extension || "unknown"}).`
  );
};

const buildNormalizeArgs = (
  inputPath: string,
  outputPath: string,
  gopSize: number,
  forceKeyframes: number[]
) => {
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    // Some files have multiple video streams; always pick the first real video track.
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "mpeg4",
    "-qscale:v",
    "2",
    "-g",
    `${gopSize}`,
    "-bf",
    "0",
    "-pix_fmt",
    "yuv420p"
  ];

  if (forceKeyframes.length > 0) {
    const keyframeList = forceKeyframes.map((time) => time.toFixed(3)).join(",");
    args.push("-force_key_frames", keyframeList);
  }

  args.push(...buildAudioArgs(outputPath), ...buildContainerArgs(outputPath), outputPath);
  return args;
};

const parseSceneTimes = (raw: string) => {
  const matches = raw.matchAll(/pts_time:([0-9.]+)/g);
  const times = new Set<number>();
  for (const match of matches) {
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value)) {
      times.add(value);
    }
  }
  return [...times].sort((a, b) => a - b);
};

const detectSceneCuts = async (inputPath: string, threshold: number) => {
  const args = [
    "-hide_banner",
    "-i",
    inputPath,
    // Align scene detection with normalization by forcing the first video stream.
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    `select='gt(scene\\,${threshold})',showinfo`,
    "-f",
    "null",
    "-"
  ];
  debug("detectSceneCuts start (threshold=%d)", threshold);
  debug("detectSceneCuts args: %o", args);
  const command = Command.sidecar(FFMPEG_SIDECAR, args);
  const output = await command.execute();
  const raw = [output.stdout, output.stderr].filter(Boolean).join("\n");

  if (output.code !== 0) {
    debug("detectSceneCuts failed (code=%s)", output.code);
    throw new Error(raw.trim() || "Scene detection failed");
  }

  const cuts = parseSceneTimes(raw);
  debug("detectSceneCuts complete (cuts=%d)", cuts.length);
  return cuts;
};

const buildSceneWindows = (
  cuts: number[],
  durationSeconds: number,
  fps: number,
  moshLengthSeconds: number
) => {
  const frameDuration = 1 / Math.max(1, fps);
  const duration = Math.max(durationSeconds, frameDuration);
  const pad = frameDuration;
  const safeCuts = cuts
    .map((cut) => Math.max(0, Math.min(duration, cut)))
    .filter(
      (cut, index, list) =>
        index === 0 || Math.abs(cut - list[index - 1]) > frameDuration / 2
    );

  if (safeCuts.length === 0) {
    return [{ start: 0, end: duration }];
  }

  return safeCuts.map((cut) => {
    const start = Math.max(0, cut - pad);
    let end = duration;

    if (moshLengthSeconds > 0) {
      end = Math.min(duration, cut + Math.max(moshLengthSeconds, frameDuration));
    } else {
      // "Until next cut" now means "until the end of the clip".
      end = duration;
    }

    if (end <= start) {
      end = Math.min(duration, start + frameDuration);
    }

    return { start, end };
  });
};

const buildRawPath = (
  outputPath: string,
  label: string,
  extension: string
) => {
  const { folder, fileName, separator } = splitOutputPath(outputPath);
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const rawName = `${baseName}.${label}.${extension}`;
  return joinOutputPath(folder, rawName, separator);
};

const buildTempMp4Path = (outputPath: string) => {
  const { folder, fileName, separator } = splitOutputPath(outputPath);
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return joinOutputPath(folder, `${baseName}.prepped.mp4`, separator);
};

const buildRemuxArgs = (
  videoPath: string,
  audioSourcePath: string,
  outputPath: string,
  fps: number,
  videoInputFormat?: string,
  width?: number,
  height?: number,
  includeAudio = true
) => {
  const args = [
    "-y",
    "-hide_banner",
    "-r",
    `${fps}`
  ];

  if (videoInputFormat) {
    // Raw bitstreams often need a larger probe window to recover headers.
    args.push("-analyzeduration", "100M", "-probesize", "100M");
    // Only some demuxers accept -video_size (m4v does not).
    if (videoInputFormat === "rawvideo" && width && height) {
      args.push("-video_size", `${width}x${height}`);
    }
    args.push("-f", videoInputFormat);
  }

  args.push(
    "-i",
    videoPath
  );

  if (includeAudio) {
    args.push("-i", audioSourcePath, "-map", "0:v:0", "-map", "1:a?");
  } else {
    args.push("-map", "0:v:0", "-an");
  }

  args.push("-c:v", "copy");
  if (includeAudio) {
    args.push(...buildAudioArgs(outputPath), "-shortest");
  }
  args.push(...buildContainerArgs(outputPath));
  args.push("-progress", "pipe:1", "-nostats", outputPath);

  return args;
};

// Discord and many web previews do not reliably decode MPEG-4 Part 2 (mp4v).
// We transcode the moshed stream to H.264 as a final "sharing-safe" step.
const clampH264Gop = (fps: number, requested: number) => {
  const minGop = Math.max(1, Math.round(fps * 2));
  const safeRequested = Math.max(minGop, Math.round(requested));
  // MPEG-4 already gets clamped near 600; keep H.264 in that safe range too.
  return Math.min(600, safeRequested);
};

const buildCompatibilityTranscodeArgs = (
  videoPath: string,
  audioSourcePath: string,
  outputPath: string,
  fps: number,
  requestedGop: number
) => {
  const gop = clampH264Gop(fps, requestedGop);
  const x264Params = `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`;

  const args = [
    "-y",
    "-hide_banner",
    // Datamoshed streams can have broken timestamps; regenerate them.
    "-fflags",
    "+genpts+discardcorrupt",
    "-err_detect",
    "ignore_err",
    "-i",
    videoPath,
    "-i",
    audioSourcePath,
    "-map",
    "0:v:0",
    "-map",
    "1:a?",
    "-vf",
    SAFE_SCALE_FILTER,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    `${fps}`,
    "-vsync",
    "cfr",
    "-g",
    `${gop}`,
    "-keyint_min",
    `${gop}`,
    "-sc_threshold",
    "0",
    "-bf",
    "0",
    "-x264-params",
    x264Params,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    ...buildContainerArgs(outputPath),
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  ];

  return args;
};

const cleanupTemps = async (paths: string[]) => {
  try {
    await invoke("cleanup_files", { paths });
  } catch {
    // Best-effort cleanup; ignore failures.
  }
};

const emitCommandOutput = (
  label: string,
  output: { code?: number | null; stdout?: string; stderr?: string },
  callbacks: DatamoshCallbacks
) => {
  const raw = [output.stdout, output.stderr].filter(Boolean).join("\n").trim();
  if (raw) {
    callbacks.onLog(`${label}:\n${raw}`);
    debug("%s output tail: %s", label, raw.slice(-1500));
  }
  if (typeof output.code === "number") {
    debug("%s exit code: %s", label, output.code);
  } else if (output.code === null) {
    debug("%s exit code: null", label);
  }
};

// Runs the datamosh pipeline with scene-based I-frame removal.
export const runDatamoshJob = async (
  asset: VideoAsset,
  outputPath: string,
  durationSeconds: number | undefined,
  config: DatamoshConfig,
  callbacks: DatamoshCallbacks
): Promise<DatamoshRunHandle> => {
  const inputPath = sanitizePath(asset.path);
  const cleanOutput = sanitizePath(outputPath);
  ensureDatamoshContainer(cleanOutput);
  const tempPath = buildTempMp4Path(cleanOutput);
  const rawPath = buildRawPath(cleanOutput, "raw", "m4v");
  const moshedPath = buildRawPath(cleanOutput, "moshed", "m4v");
  const remuxPath = buildRawPath(cleanOutput, "remuxed", "mp4");
  // MPEG-4 Part 2 caps keyint near 600; clamp to avoid noisy warnings.
  const gopSize = Math.min(
    MAX_GOP_SIZE,
    Math.max(MIN_GOP_SIZE, Math.round(config.gopSize))
  );
  const threshold = Math.max(0, Math.min(1, config.sceneThreshold));
  const moshLength = Math.max(0, config.moshLengthSeconds);

  debug("runDatamoshJob start");
  debug("paths: input=%s output=%s temp=%s", inputPath, cleanOutput, tempPath);
  debug(
    "config: intensity=%d gop=%d threshold=%d moshLength=%d seed=%d",
    config.intensity,
    gopSize,
    threshold,
    moshLength,
    config.seed
  );
  callbacks.onProgress({ percent: 0 });

  let fps = 30;
  let width: number | undefined;
  let height: number | undefined;
  let durationForProgress = durationSeconds;

  try {
    const cuts = await detectSceneCuts(inputPath, threshold);
    debug("scene cuts: %o", cuts.slice(0, 12));
    const normalizeCommand = Command.sidecar(
      FFMPEG_SIDECAR,
      buildNormalizeArgs(inputPath, tempPath, gopSize, cuts)
    );
    debug("normalize args: %o", buildNormalizeArgs(inputPath, tempPath, gopSize, cuts));
    const normalizeOutput = await normalizeCommand.execute();
    emitCommandOutput("normalize", normalizeOutput, callbacks);
    if (normalizeOutput.code !== 0) {
      const raw = [normalizeOutput.stdout, normalizeOutput.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      throw new Error(raw || "Failed to normalize input for datamosh");
    }

    const probe = await probeVideo(tempPath);
    fps = probe.fps ?? fps;
    width = probe.width;
    height = probe.height;
    const minWindowLength = 1 / fps;
    const duration = probe.durationSeconds ?? durationSeconds ?? minWindowLength;
    durationForProgress = duration;
    const windows = buildSceneWindows(cuts, duration, fps, moshLength);
    debug("probe: fps=%d duration=%d", fps, duration);
    debug("windows: %o", windows.slice(0, 12));
    debug("probe: width=%s height=%s", width ?? "--", height ?? "--");
    let extradataHex: string | undefined;
    try {
      extradataHex = await probeVideoExtradata(tempPath);
      debug("extradata length=%d", extradataHex?.length ?? 0);
    } catch (error) {
      debug("extradata probe failed: %O", error);
    }

    const extractArgs = [
      "-y",
      "-hide_banner",
      "-i",
      tempPath,
      "-c:v",
      "copy",
      "-an",
      "-bsf:v",
      "dump_extra",
      "-f",
      "m4v",
      rawPath
    ];
    debug("extract args: %o", extractArgs);
    const extractCommand = Command.sidecar(FFMPEG_SIDECAR, extractArgs);
    const extractOutput = await extractCommand.execute();
    emitCommandOutput("extract", extractOutput, callbacks);
    if (extractOutput.code !== 0) {
      const raw = [extractOutput.stdout, extractOutput.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      throw new Error(raw || "Failed to extract MPEG-4 bitstream");
    }

    await invoke("datamosh_bitstream", {
      inputPath: rawPath,
      outputPath: moshedPath,
      fps,
      windows,
      intensity: config.intensity,
      seed: config.seed,
      extradataHex
    });
    debug("datamosh_bitstream invoke complete");

    // First remux the moshed MPEG-4 stream into a container safely.
    // We keep this video-only to avoid double-encoding the audio track.
    const remuxArgs = buildRemuxArgs(
      moshedPath,
      tempPath,
      remuxPath,
      fps,
      "m4v",
      width,
      height,
      false
    );
    debug("remux (mpeg4 copy) args: %o", remuxArgs);
    const remuxOutput = await Command.sidecar(FFMPEG_SIDECAR, remuxArgs).execute();
    emitCommandOutput("remux", remuxOutput, callbacks);
    if (remuxOutput.code !== 0) {
      const raw = [remuxOutput.stdout, remuxOutput.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      throw new Error(raw || "Failed to remux moshed MPEG-4 stream");
    }
  } catch (error) {
    debug("runDatamoshJob failed: %O", error);
    await cleanupTemps([tempPath, rawPath, moshedPath, remuxPath]);
    throw error;
  }

  const args = buildCompatibilityTranscodeArgs(
    remuxPath,
    tempPath,
    cleanOutput,
    fps,
    gopSize
  );
  debug("compat transcode args: %o", args);
  const command = Command.sidecar(FFMPEG_SIDECAR, args);
  const feedProgress = createFfmpegProgressParser(durationForProgress, (progress) => {
    callbacks.onProgress(progress);
  });

  command.stdout.on("data", (line) => {
    if (typeof line === "string") {
      feedProgress(line);
    }
  });

  command.stderr.on("data", (line) => {
    if (typeof line === "string" && line.trim().length > 0) {
      callbacks.onLog(line.trim());
      debug("compat transcode stderr: %s", line.trim());
    }
  });

  command.on("error", (error) => {
    const unknownError = error as unknown;
    const message =
      typeof unknownError === "string"
        ? unknownError
        : unknownError instanceof Error
          ? unknownError.message
          : String(unknownError ?? "Unknown ffmpeg error");
    debug("compat transcode error: %O", unknownError);
    callbacks.onError(message);
    void cleanupTemps([tempPath, rawPath, moshedPath, remuxPath]);
  });

  command.on("close", ({ code, signal }) => {
    debug("compat transcode close: code=%s signal=%s", code, signal);
    const signalValue =
      typeof signal === "string"
        ? signal
        : signal === null || signal === undefined
          ? null
          : String(signal);
    callbacks.onClose(code ?? null, signalValue);
    void cleanupTemps([tempPath, rawPath, moshedPath, remuxPath]);
  });

  const child = await command.spawn();

  return {
    outputPath: cleanOutput,
    cancel: () => child.kill()
  };
};
