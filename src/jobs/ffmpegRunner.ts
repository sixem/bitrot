import type { VideoAsset } from "@/domain/video";
import { createFfmpegProgressParser } from "@/jobs/ffmpegProgress";
import { buildDefaultOutputPath, pathsMatch } from "@/jobs/output";
import { runDatamoshJob } from "@/jobs/datamoshRunner";
import { runPixelsortJob } from "@/jobs/pixelsortRunner";
import {
  SAFE_SCALE_FILTER,
  buildAudioArgs,
  buildContainerArgs
} from "@/jobs/ffmpegArgs";
import {
  spawnWithFallback,
  type CommandHandle,
  type CommandSource
} from "@/system/shellCommand";
import { sanitizePath } from "@/system/path";
import {
  getModeDefinition,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import {
  defaultDatamoshConfig,
  type DatamoshConfig
} from "@/modes/datamosh";
import {
  defaultPixelsortConfig,
  type PixelsortConfig
} from "@/modes/pixelsort";
import type { JobProgress } from "@/jobs/types";
import {
  DEFAULT_ENCODING_ID,
  buildVideoEncodingArgs,
  estimateBitrateCapKbps,
  getEncodingPreset,
  type EncodingId
} from "@/jobs/encoding";
import { probeVideo, type VideoMetadata } from "@/system/ffprobe";
import makeDebug from "@/utils/debug";

type FfmpegRunOptions = {
  outputPath?: string;
  durationSeconds?: number;
  inputMetadata?: VideoMetadata;
  modeId?: ModeId;
  modeConfig?: ModeConfigMap[ModeId];
  encodingId?: EncodingId;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
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

const debug = makeDebug("jobs:runner");


const normalizeTrimRange = (start?: number, end?: number) => {
  if (typeof start !== "number" || typeof end !== "number") {
    return undefined;
  }
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(0, end);
  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd)) {
    return undefined;
  }
  if (safeEnd <= safeStart) {
    return undefined;
  }
  return { start: safeStart, end: safeEnd };
};

const buildTrimArgs = (range?: { start: number; end: number }) => {
  if (!range) {
    return [];
  }
  return ["-ss", range.start.toFixed(3), "-to", range.end.toFixed(3)];
};

const buildArgs = (
  inputPath: string,
  outputPath: string,
  modeId?: ModeId,
  modeConfig?: ModeConfigMap[ModeId],
  encodingId?: EncodingId,
  trimStartSeconds?: number,
  trimEndSeconds?: number,
  bitrateCapKbps?: number,
  needsEvenDimensions = true
) => {
  const mode = getModeDefinition(modeId);
  const resolvedConfig = modeConfig ?? mode.defaultConfig;
  const encoding = getEncodingPreset(encodingId ?? DEFAULT_ENCODING_ID);
  const trimRange = normalizeTrimRange(trimStartSeconds, trimEndSeconds);
  const shouldCopy = mode.encode === "copy" && !trimRange;
  // Always pick the first video + (optional) first audio stream explicitly.
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    ...buildTrimArgs(trimRange),
    "-map",
    "0:v:0",
    "-map",
    "0:a?"
  ];

  const filters: string[] = [];
  if (mode.buildFilter) {
    filters.push(mode.buildFilter(resolvedConfig));
  }
  if (!shouldCopy && needsEvenDimensions) {
    filters.push(SAFE_SCALE_FILTER);
  }
  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  if (shouldCopy) {
    args.push("-c", "copy");
  } else {
    args.push(
      ...buildVideoEncodingArgs(encoding, bitrateCapKbps),
      "-pix_fmt",
      "yuv420p",
      ...buildAudioArgs(outputPath),
      ...buildContainerArgs(outputPath)
    );
  }

  args.push("-progress", "pipe:1", "-nostats", outputPath);
  return args;
};

const deriveEncodingMetadata = (
  metadata: VideoMetadata,
  encodingId?: EncodingId
) => {
  const preset = getEncodingPreset(encodingId ?? DEFAULT_ENCODING_ID);
  const bitrateCapKbps = estimateBitrateCapKbps(
    metadata.sizeBytes,
    metadata.durationSeconds,
    preset
  );
  const width =
    typeof metadata.width === "number" && Number.isFinite(metadata.width)
      ? metadata.width
      : undefined;
  const height =
    typeof metadata.height === "number" && Number.isFinite(metadata.height)
      ? metadata.height
      : undefined;
  const needsEvenDimensions =
    width !== undefined && height !== undefined
      ? width % 2 !== 0 || height % 2 !== 0
      : true;
  return { bitrateCapKbps, needsEvenDimensions };
};

const resolveEncodingMetadata = async (
  inputPath: string,
  encodingId?: EncodingId,
  metadata?: VideoMetadata
) => {
  if (metadata) {
    return deriveEncodingMetadata(metadata, encodingId);
  }
  try {
    const probe = await probeVideo(inputPath);
    return deriveEncodingMetadata(probe, encodingId);
  } catch (error) {
    debug("bitrate cap probe failed: %O", error);
    return { bitrateCapKbps: undefined, needsEvenDimensions: true };
  }
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
  const activeMode = getModeDefinition(options.modeId);
  if (pathsMatch(inputPath, outputPath)) {
    throw new Error(
      "Output path matches the input file. Choose a different output name."
    );
  }
  debug(
    "runFfmpegJob start: mode=%s input=%s output=%s",
    activeMode.id,
    inputPath,
    outputPath
  );
  if (activeMode.runner === "datamosh") {
    const datamoshConfig = (options.modeConfig as DatamoshConfig | undefined) ?? {
      ...defaultDatamoshConfig
    };
    const encodingId = options.encodingId ?? DEFAULT_ENCODING_ID;
    debug("delegating to datamosh pipeline");
    return runDatamoshJob(
      asset,
      outputPath,
      options.durationSeconds,
      datamoshConfig,
      encodingId,
      options.trimStartSeconds,
      options.trimEndSeconds,
      callbacks
    );
  }
  if (activeMode.runner === "pixelsort") {
    const pixelsortConfig = (options.modeConfig as PixelsortConfig | undefined) ?? {
      ...defaultPixelsortConfig
    };
    const encodingId = options.encodingId ?? DEFAULT_ENCODING_ID;
    debug("delegating to pixelsort pipeline");
    return runPixelsortJob(
      asset,
      outputPath,
      options.durationSeconds,
      pixelsortConfig,
      encodingId,
      options.trimStartSeconds,
      options.trimEndSeconds,
      callbacks
    );
  }

  const { bitrateCapKbps, needsEvenDimensions } = await resolveEncodingMetadata(
    inputPath,
    options.encodingId,
    options.inputMetadata
  );
  const args = buildArgs(
    inputPath,
    outputPath,
    options.modeId,
    options.modeConfig,
    options.encodingId,
    options.trimStartSeconds,
    options.trimEndSeconds,
    bitrateCapKbps,
    needsEvenDimensions
  );
  debug("ffmpeg args: %o", args);
  const feedProgress = createFfmpegProgressParser(
    options.durationSeconds,
    callbacks.onProgress
  );

  const bindHandlers = (command: CommandHandle, source: CommandSource) => {
    debug("ffmpeg source: %s", source);
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
  };

  const { child } = await spawnWithFallback("ffmpeg", args, bindHandlers);

  return {
    outputPath,
    cancel: async () => {
      await child.kill();
    }
  };
};
