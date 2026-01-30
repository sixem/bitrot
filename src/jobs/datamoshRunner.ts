// Datamosh pipeline: normalize to MPEG-4, detect cuts, then drop intra VOPs.
import { invoke } from "@tauri-apps/api/core";
import type { VideoAsset } from "@/domain/video";
import { createFfmpegProgressParser } from "@/jobs/ffmpegProgress";
import {
  buildTempOutputPath,
  joinOutputPath,
  pathsMatch,
  splitOutputPath
} from "@/jobs/output";
import {
  SAFE_SCALE_FILTER,
  getExtension,
  buildAudioArgs,
  buildContainerArgs,
  parseExtraArgs
} from "@/jobs/ffmpegArgs";
import type { JobProgress } from "@/jobs/types";
import {
  buildVideoEncodingArgs,
  estimateInputBitrateCapKbps,
  estimateTargetBitrateKbps
} from "@/jobs/exportEncoding";
import { DEFAULT_EXPORT_PROFILE, type ExportProfile } from "@/jobs/exportProfile";
import type { DatamoshConfig } from "@/modes/datamosh";
import { probeVideo, probeVideoExtradata } from "@/system/ffprobe";
import {
  executeWithFallback,
  spawnWithFallback,
  type CommandHandle,
  type CommandSource
} from "@/system/shellCommand";
import { sanitizePath } from "@/system/path";
import { cleanupFiles } from "@/system/cleanup";
import { normalizeTrimRange, type TrimRange } from "@/jobs/trim";
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

const debug = makeDebug("jobs:datamosh");

const MIN_GOP_SIZE = 30;
const MAX_GOP_SIZE = 600;

const buildTrimArgs = (trim?: TrimRange) => {
  if (!trim) {
    return [];
  }
  return ["-ss", trim.start.toFixed(3), "-to", trim.end.toFixed(3)];
};

const ensureDatamoshContainer = (outputPath: string) => {
  const extension = getExtension(outputPath);
  if (
    extension === "mp4" ||
    extension === "m4v" ||
    extension === "mkv" ||
    extension === "mov" ||
    extension === "webm"
  ) {
    return;
  }
  throw new Error(
    `Datamosh output must be .mp4, .mkv, .mov, or .webm (got .${
      extension || "unknown"
    }).`
  );
};

const buildNormalizeArgs = (
  inputPath: string,
  outputPath: string,
  gopSize: number,
  forceKeyframes: number[],
  trim?: TrimRange
) => {
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    ...buildTrimArgs(trim),
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

const detectSceneCuts = async (
  inputPath: string,
  threshold: number,
  trim?: TrimRange
) => {
  const args = [
    "-hide_banner",
    "-i",
    inputPath,
    ...buildTrimArgs(trim),
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
  const { output, source } = await executeWithFallback("ffmpeg", args);
  debug("detectSceneCuts source: %s", source);
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

export const getDatamoshTempPaths = (outputPath: string) => ({
  tempPath: buildTempMp4Path(outputPath),
  rawPath: buildRawPath(outputPath, "raw", "m4v"),
  moshedPath: buildRawPath(outputPath, "moshed", "m4v"),
  remuxPath: buildRawPath(outputPath, "remuxed", "mp4")
});

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

const clampH264Gop = (fps: number, requested: number) => {
  const minGop = Math.max(1, Math.round(fps * 2));
  const safeRequested = Math.max(minGop, Math.round(requested));
  return Math.min(600, safeRequested);
};

const buildFinalTranscodeArgs = (
  videoPath: string,
  audioSourcePath: string,
  outputPath: string,
  fps: number,
  requestedGop: number,
  profile: ExportProfile,
  options: {
    bitrateCapKbps?: number;
    targetBitrateKbps?: number;
    includeAudio?: boolean;
    pass?: 1 | 2;
    passLogFile?: string;
  }
) => {
  const includeAudio = options.includeAudio ?? profile.audioEnabled;
  const isH264 =
    profile.videoEncoder === "libx264" || profile.videoEncoder === "h264_nvenc";
  const gop = isH264 ? clampH264Gop(fps, requestedGop) : Math.round(requestedGop);
  const x264Params = isH264
    ? `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`
    : "";
  const extraArgs = parseExtraArgs(profile.extraArgs);

  const args = [
    "-y",
    "-hide_banner",
    // Datamoshed streams can have broken timestamps; regenerate them.
    "-fflags",
    "+genpts+discardcorrupt",
    "-err_detect",
    "ignore_err",
    "-i",
    videoPath
  ];

  if (includeAudio) {
    args.push("-i", audioSourcePath, "-map", "0:v:0", "-map", "1:a?");
  } else {
    args.push("-map", "0:v:0", "-an");
  }

  args.push(
    "-vf",
    SAFE_SCALE_FILTER,
    ...buildVideoEncodingArgs(profile, {
      bitrateCapKbps: options.bitrateCapKbps,
      targetBitrateKbps: options.targetBitrateKbps,
      pass: options.pass,
      passLogFile: options.passLogFile
    }),
    "-pix_fmt",
    "yuv420p",
    "-r",
    `${fps}`,
    "-vsync",
    "cfr"
  );

  if (isH264) {
    args.push(
      "-g",
      `${gop}`,
      "-keyint_min",
      `${gop}`,
      "-sc_threshold",
      "0",
      "-bf",
      "0"
    );
  }

  if (profile.videoEncoder === "libx264") {
    args.push("-x264-params", x264Params);
  }

  if (includeAudio) {
    args.push(...buildAudioArgs(outputPath, { enabled: true }), "-shortest");
  }

  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  args.push(
    ...buildContainerArgs(outputPath),
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  );

  return args;
};

const cleanupTemps = async (paths: string[]) => {
  // Best-effort cleanup; ignore failures.
  await cleanupFiles(paths, "datamosh temps");
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
  profile: ExportProfile,
  trimStartSeconds: number | undefined,
  trimEndSeconds: number | undefined,
  callbacks: DatamoshCallbacks
): Promise<DatamoshRunHandle> => {
  const inputPath = sanitizePath(asset.path);
  const cleanOutput = sanitizePath(outputPath);
  if (pathsMatch(inputPath, cleanOutput)) {
    throw new Error(
      "Output path matches the input file. Choose a different output name."
    );
  }
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
  const resolvedProfile = profile ?? DEFAULT_EXPORT_PROFILE;
  const trimRange = normalizeTrimRange(trimStartSeconds, trimEndSeconds);
  let bitrateCapKbps: number | undefined;
  let targetBitrateKbps: number | undefined;

  debug("runDatamoshJob start");
  debug("paths: input=%s output=%s temp=%s", inputPath, cleanOutput, tempPath);
  debug(
    "config: intensity=%d gop=%d threshold=%d moshLength=%d seed=%d encoder=%s",
    config.intensity,
    gopSize,
    threshold,
    moshLength,
    config.seed,
    resolvedProfile.videoEncoder
  );
  callbacks.onProgress({ percent: 0 });

  let fps = 30;
  let width: number | undefined;
  let height: number | undefined;
  let durationForProgress = durationSeconds;

  try {
    try {
      const inputProbe = await probeVideo(inputPath);
      bitrateCapKbps = estimateInputBitrateCapKbps(
        inputProbe.sizeBytes,
        inputProbe.durationSeconds
      );
    } catch (error) {
      debug("bitrate cap probe failed: %O", error);
    }

    const cuts = await detectSceneCuts(inputPath, threshold, trimRange);
    debug("scene cuts: %o", cuts.slice(0, 12));
    const normalizeArgs = buildNormalizeArgs(inputPath, tempPath, gopSize, cuts, trimRange);
    debug("normalize args: %o", normalizeArgs);
    const { output: normalizeOutput, source: normalizeSource } =
      await executeWithFallback("ffmpeg", normalizeArgs);
    debug("normalize source: %s", normalizeSource);
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
    targetBitrateKbps = estimateTargetBitrateKbps(
      resolvedProfile.sizeCapMb,
      durationForProgress
    );
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
    const { output: extractOutput, source: extractSource } =
      await executeWithFallback("ffmpeg", extractArgs);
    debug("extract source: %s", extractSource);
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
    const { output: remuxOutput, source: remuxSource } =
      await executeWithFallback("ffmpeg", remuxArgs);
    debug("remux (mpeg4 copy) source: %s", remuxSource);
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

  const shouldTwoPass =
    resolvedProfile.videoEncoder === "libvpx-vp9" &&
    (resolvedProfile.passMode === "2pass" ||
      (resolvedProfile.passMode === "auto" &&
        resolvedProfile.sizeCapMb !== undefined)) &&
    typeof targetBitrateKbps === "number";
  const passLogPrefix = buildTempOutputPath(cleanOutput, "passlog");
  const pass1Output = buildTempOutputPath(cleanOutput, "pass1");
  let activeChild: { kill: () => Promise<void> } | null = null;
  const cleanupAll = async () => {
    await cleanupTemps([tempPath, rawPath, moshedPath, remuxPath]);
    await cleanupFiles(
      [pass1Output, `${passLogPrefix}-0.log`, `${passLogPrefix}-0.log.mbtree`],
      "datamosh pass logs"
    );
  };

  const createHandlers = (
    feedProgress: (line: string) => void,
    label: string,
    onClose: (code: number | null, signal: string | null) => void
  ) => {
    return (command: CommandHandle, source: CommandSource) => {
      debug("compat transcode source: %s", source);
      command.stdout.on("data", (line) => {
        if (typeof line === "string") {
          feedProgress(line);
        }
      });

      command.stderr.on("data", (line) => {
        if (typeof line === "string" && line.trim().length > 0) {
          const trimmed = line.trim();
          callbacks.onLog(label ? `${label}: ${trimmed}` : trimmed);
          debug("compat transcode stderr: %s", trimmed);
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
        void cleanupAll();
      });

      command.on("close", ({ code, signal }) => {
        debug("compat transcode close: code=%s signal=%s", code, signal);
        const signalValue =
          typeof signal === "string"
            ? signal
            : signal === null || signal === undefined
              ? null
              : String(signal);
        onClose(code ?? null, signalValue);
      });
    };
  };

  const createProgressHandler = (startPercent: number, endPercent: number) =>
    createFfmpegProgressParser(durationForProgress, (progress) => {
      const scaled = {
        ...progress,
        percent: Number.isFinite(progress.percent)
          ? startPercent + (progress.percent / 100) * (endPercent - startPercent)
          : progress.percent
      };
      callbacks.onProgress(scaled);
    });

  const spawnPass = async (
    args: string[],
    label: string,
    startPercent: number,
    endPercent: number,
    onClose: (code: number | null, signal: string | null) => void
  ) => {
    const feedProgress = createProgressHandler(startPercent, endPercent);
    const { child } = await spawnWithFallback(
      "ffmpeg",
      args,
      createHandlers(feedProgress, label, onClose)
    );
    activeChild = child;
  };

  if (!shouldTwoPass) {
    const args = buildFinalTranscodeArgs(
      remuxPath,
      tempPath,
      cleanOutput,
      fps,
      gopSize,
      resolvedProfile,
      {
        bitrateCapKbps,
        targetBitrateKbps,
        includeAudio: resolvedProfile.audioEnabled
      }
    );
    debug("compat transcode args: %o", args);
    try {
      await spawnPass(args, "", 0, 100, async (code, signal) => {
        callbacks.onClose(code, signal);
        await cleanupAll();
      });
    } catch (error) {
      debug("compat transcode spawn failed: %O", error);
      await cleanupAll();
      throw error;
    }

    return {
      outputPath: cleanOutput,
      cancel: async () => {
        if (activeChild) {
          await activeChild.kill();
        }
      }
    };
  }

  const pass1Args = buildFinalTranscodeArgs(
    remuxPath,
    tempPath,
    pass1Output,
    fps,
    gopSize,
    resolvedProfile,
    {
      bitrateCapKbps,
      targetBitrateKbps,
      includeAudio: false,
      pass: 1,
      passLogFile: passLogPrefix
    }
  );
  const pass2Args = buildFinalTranscodeArgs(
    remuxPath,
    tempPath,
    cleanOutput,
    fps,
    gopSize,
    resolvedProfile,
    {
      bitrateCapKbps,
      targetBitrateKbps,
      includeAudio: resolvedProfile.audioEnabled,
      pass: 2,
      passLogFile: passLogPrefix
    }
  );
  debug("compat pass1 args: %o", pass1Args);
  debug("compat pass2 args: %o", pass2Args);

  try {
    await spawnPass(pass1Args, "pass1", 0, 50, async (code, signal) => {
      if (code !== 0) {
        callbacks.onClose(code, signal);
        await cleanupAll();
        return;
      }
      try {
        await spawnPass(pass2Args, "pass2", 50, 100, async (finalCode, finalSignal) => {
          callbacks.onClose(finalCode, finalSignal);
          await cleanupAll();
        });
      } catch (error) {
        debug("compat pass2 spawn failed: %O", error);
        await cleanupAll();
        throw error;
      }
    });
  } catch (error) {
    debug("compat pass1 spawn failed: %O", error);
    await cleanupAll();
    throw error;
  }

  return {
    outputPath: cleanOutput,
    cancel: async () => {
      if (activeChild) {
        await activeChild.kill();
      }
    }
  };
};
