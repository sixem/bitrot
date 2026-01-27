import { Command } from "@tauri-apps/plugin-shell";
import type { VideoAsset } from "@/domain/video";
import { createFfmpegProgressParser } from "@/jobs/ffmpegProgress";
import { buildDefaultOutputPath } from "@/jobs/output";
import { runDatamoshJob } from "@/jobs/datamoshRunner";
import {
  getModeDefinition,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import {
  defaultDatamoshConfig,
  type DatamoshConfig
} from "@/modes/datamosh";
import type { JobProgress } from "@/jobs/types";
import makeDebug from "@/utils/debug";

type FfmpegRunOptions = {
  outputPath?: string;
  durationSeconds?: number;
  modeId?: ModeId;
  modeConfig?: ModeConfigMap[ModeId];
};

type FfmpegRunCallbacks = {
  onProgress: (progress: JobProgress) => void;
  onLog: (line: string) => void;
  onClose: (code: number | null, signal: string | null) => void;
  onError: (message: string) => void;
};

export type FfmpegRunHandle = {
  outputPath: string;
  cancel: () => Promise<void>;
};

const FFMPEG_SIDECAR = "binaries/ffmpeg";
const debug = makeDebug("jobs:runner");

const sanitizePath = (value: string) => value.trim().replace(/^"+|"+$/g, "");
// libx264 requires even dimensions; we trim odd pixels safely.
const SAFE_SCALE_FILTER = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1";

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

const buildArgs = (
  inputPath: string,
  outputPath: string,
  modeId?: ModeId,
  modeConfig?: ModeConfigMap[ModeId]
) => {
  const mode = getModeDefinition(modeId);
  const resolvedConfig = modeConfig ?? mode.defaultConfig;
  // Always pick the first video + (optional) first audio stream explicitly.
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?"
  ];

  const filters: string[] = [];
  if (mode.buildFilter) {
    filters.push(mode.buildFilter(resolvedConfig));
  }
  if (mode.encode !== "copy") {
    filters.push(SAFE_SCALE_FILTER);
  }
  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  if (mode.encode === "copy") {
    args.push("-c", "copy");
  } else {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      ...buildAudioArgs(outputPath),
      ...buildContainerArgs(outputPath)
    );
  }

  args.push("-progress", "pipe:1", "-nostats", outputPath);
  return args;
};

// Runs an ffmpeg job for the selected mode with progress output for UI wiring.
export const runFfmpegJob = async (
  asset: VideoAsset,
  options: FfmpegRunOptions,
  callbacks: FfmpegRunCallbacks
): Promise<FfmpegRunHandle> => {
  const inputPath = sanitizePath(asset.path);
  const outputPath = sanitizePath(
    options.outputPath ?? buildDefaultOutputPath(inputPath)
  );
  debug(
    "runFfmpegJob start: mode=%s input=%s output=%s",
    options.modeId ?? "analog",
    inputPath,
    outputPath
  );
  if (options.modeId === "datamosh") {
    const datamoshConfig = (options.modeConfig as DatamoshConfig | undefined) ?? {
      ...defaultDatamoshConfig
    };
    debug("delegating to datamosh pipeline");
    return runDatamoshJob(
      asset,
      outputPath,
      options.durationSeconds,
      datamoshConfig,
      callbacks
    );
  }

  const args = buildArgs(inputPath, outputPath, options.modeId, options.modeConfig);
  debug("ffmpeg args: %o", args);
  const command = Command.sidecar(FFMPEG_SIDECAR, args);
  const feedProgress = createFfmpegProgressParser(
    options.durationSeconds,
    callbacks.onProgress
  );

  command.stdout.on("data", (line) => {
    if (typeof line === "string") {
      feedProgress(line);
    }
  });

  command.stderr.on("data", (line) => {
    if (typeof line === "string" && line.trim().length > 0) {
      callbacks.onLog(line.trim());
      debug("stderr: %s", line.trim());
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
    debug("ffmpeg error: %O", unknownError);
    callbacks.onError(message);
  });

  command.on("close", ({ code, signal }) => {
    debug("ffmpeg close: code=%s signal=%s", code, signal);
    const signalValue =
      typeof signal === "string"
        ? signal
        : signal === null || signal === undefined
          ? null
          : String(signal);
    callbacks.onClose(code ?? null, signalValue);
  });

  const child = await command.spawn();

  return {
    outputPath,
    cancel: () => child.kill()
  };
};
