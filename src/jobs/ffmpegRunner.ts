// Unified ffmpeg runner for core effects and delegating to specialized pipelines.
import type { VideoAsset } from "@/domain/video";
import { createFfmpegProgressParser } from "@/jobs/ffmpegProgress";
import {
  buildDefaultOutputPath,
  buildTempOutputPath,
  pathsMatch
} from "@/jobs/output";
import { runDatamoshJob } from "@/jobs/datamoshRunner";
import { runPixelsortJob } from "@/jobs/pixelsortRunner";
import { normalizeTrimRange, type TrimRange } from "@/jobs/trim";
import {
  SAFE_SCALE_FILTER,
  buildAudioArgs,
  buildContainerArgs,
  parseExtraArgs
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
  buildVideoEncodingArgs,
  estimateInputBitrateCapKbps,
  estimateTargetBitrateKbps
} from "@/jobs/exportEncoding";
import { DEFAULT_EXPORT_PROFILE, type ExportProfile } from "@/jobs/exportProfile";
import { probeVideo, type VideoMetadata } from "@/system/ffprobe";
import { cleanupFiles } from "@/system/cleanup";
import makeDebug from "@/utils/debug";

type FfmpegRunOptions = {
  outputPath?: string;
  durationSeconds?: number;
  inputMetadata?: VideoMetadata;
  modeId?: ModeId;
  modeConfig?: ModeConfigMap[ModeId];
  profile?: ExportProfile;
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
  jobId?: string;
  cancel: () => Promise<void>;
};

const debug = makeDebug("jobs:runner");

const buildTrimArgs = (range?: TrimRange) => {
  if (!range) {
    return [];
  }
  return ["-ss", range.start.toFixed(3), "-to", range.end.toFixed(3)];
};

const buildArgs = (
  inputPath: string,
  outputPath: string,
  modeId: ModeId | undefined,
  modeConfig: ModeConfigMap[ModeId] | undefined,
  profile: ExportProfile,
  trimRange: TrimRange | undefined,
  options: {
    bitrateCapKbps?: number;
    targetBitrateKbps?: number;
    needsEvenDimensions?: boolean;
    pass?: 1 | 2;
    passLogFile?: string;
    audioEnabledOverride?: boolean;
    includeProgress?: boolean;
  }
) => {
  const mode = getModeDefinition(modeId);
  const resolvedConfig = modeConfig ?? mode.defaultConfig;
  const shouldCopy =
    profile.videoMode === "copy" && !trimRange && !mode.buildFilter;
  const needsEvenDimensions = options.needsEvenDimensions ?? true;
  const audioEnabled =
    options.audioEnabledOverride ?? profile.audioEnabled ?? true;
  // Always pick the first video + (optional) first audio stream explicitly.
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    ...buildTrimArgs(trimRange),
    "-map",
    "0:v:0"
  ];
  if (audioEnabled) {
    args.push("-map", "0:a?");
  }

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
    args.push("-c:v", "copy");
    if (audioEnabled) {
      args.push("-c:a", "copy");
    } else {
      args.push("-an");
    }
    const containerArgs = buildContainerArgs(outputPath);
    if (containerArgs.length > 0) {
      args.push(...containerArgs);
    }
  } else {
    const bitrateCap =
      options.targetBitrateKbps ?? options.bitrateCapKbps;
    args.push(
      ...buildVideoEncodingArgs(profile, {
        bitrateCapKbps: bitrateCap,
        targetBitrateKbps: options.targetBitrateKbps,
        pass: options.pass,
        passLogFile: options.passLogFile
      }),
      "-pix_fmt",
      "yuv420p",
      ...buildAudioArgs(outputPath, { enabled: audioEnabled }),
      ...buildContainerArgs(outputPath)
    );
  }

  const extraArgs = parseExtraArgs(profile.extraArgs);
  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  if (options.includeProgress !== false) {
    args.push("-progress", "pipe:1", "-nostats");
  }
  args.push(outputPath);
  return args;
};

const deriveEncodingMetadata = (metadata: VideoMetadata) => {
  const bitrateCapKbps = estimateInputBitrateCapKbps(
    metadata.sizeBytes,
    metadata.durationSeconds
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
  metadata?: VideoMetadata
) => {
  if (metadata) {
    return deriveEncodingMetadata(metadata);
  }
  try {
    const probe = await probeVideo(inputPath);
    return deriveEncodingMetadata(probe);
  } catch (error) {
    debug("bitrate cap probe failed: %O", error);
    return { bitrateCapKbps: undefined, needsEvenDimensions: true };
  }
};

const getPassLogPaths = (prefix: string) => [
  `${prefix}-0.log`,
  `${prefix}-0.log.mbtree`
];

const scaleProgress = (
  progress: JobProgress,
  startPercent: number,
  endPercent: number
) => {
  if (!Number.isFinite(progress.percent)) {
    return progress;
  }
  const clamped = Math.max(0, Math.min(100, progress.percent));
  const scaled =
    startPercent + (clamped / 100) * (endPercent - startPercent);
  return {
    ...progress,
    percent: scaled
  };
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
  const profile = options.profile ?? DEFAULT_EXPORT_PROFILE;
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
    debug("delegating to datamosh pipeline");
    return runDatamoshJob(
      asset,
      outputPath,
      options.durationSeconds,
      datamoshConfig,
      profile,
      options.trimStartSeconds,
      options.trimEndSeconds,
      callbacks
    );
  }
  if (activeMode.runner === "pixelsort") {
    const pixelsortConfig = (options.modeConfig as PixelsortConfig | undefined) ?? {
      ...defaultPixelsortConfig
    };
    debug("delegating to pixelsort pipeline");
    return runPixelsortJob(
      asset,
      outputPath,
      options.durationSeconds,
      pixelsortConfig,
      profile,
      options.trimStartSeconds,
      options.trimEndSeconds,
      callbacks
    );
  }

  const trimRange = normalizeTrimRange(
    options.trimStartSeconds,
    options.trimEndSeconds
  );
  const { bitrateCapKbps, needsEvenDimensions } = await resolveEncodingMetadata(
    inputPath,
    options.inputMetadata
  );
  const effectiveDuration =
    trimRange && trimRange.end > trimRange.start
      ? trimRange.end - trimRange.start
      : options.durationSeconds ?? options.inputMetadata?.durationSeconds;
  const targetBitrateKbps = estimateTargetBitrateKbps(
    profile.sizeCapMb,
    effectiveDuration
  );
  const shouldTwoPass =
    profile.videoMode !== "copy" &&
    profile.videoEncoder === "libvpx-vp9" &&
    (profile.passMode === "2pass" ||
      (profile.passMode === "auto" && profile.sizeCapMb !== undefined)) &&
    typeof targetBitrateKbps === "number";
  const createProgressHandler = (startPercent: number, endPercent: number) =>
    createFfmpegProgressParser(effectiveDuration, (progress) => {
      callbacks.onProgress(scaleProgress(progress, startPercent, endPercent));
    });

  const createHandlers = (
    feedProgress: (line: string) => void,
    label: string,
    onClose: (code: number | null, signal: string | null) => void
  ) => {
    return (command: CommandHandle, source: CommandSource) => {
      debug("ffmpeg source: %s", source);
      command.stdout.on("data", (line) => {
        if (typeof line === "string") {
          feedProgress(line);
        }
      });

      command.stderr.on("data", (line) => {
        if (typeof line === "string" && line.trim().length > 0) {
          const trimmed = line.trim();
          callbacks.onLog(label ? `${label}: ${trimmed}` : trimmed);
          debug("stderr: %s", trimmed);
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
        onClose(code ?? null, signalValue);
      });
    };
  };

  if (!shouldTwoPass) {
    const args = buildArgs(
      inputPath,
      outputPath,
      options.modeId,
      options.modeConfig,
      profile,
      trimRange,
      {
        bitrateCapKbps,
        targetBitrateKbps,
        needsEvenDimensions
      }
    );
    debug("ffmpeg args: %o", args);
    const feedProgress = createProgressHandler(0, 100);
    const { child } = await spawnWithFallback(
      "ffmpeg",
      args,
      createHandlers(feedProgress, "", (code, signal) => {
        callbacks.onClose(code, signal);
      })
    );

    return {
      outputPath,
      jobId: undefined,
      cancel: async () => {
        await child.kill();
      }
    };
  }

  const passLogPrefix = buildTempOutputPath(outputPath, "passlog");
  const pass1Output = buildTempOutputPath(outputPath, "pass1");
  let activeChild: { kill: () => Promise<void> } | null = null;
  let canceled = false;

  const cleanupPassArtifacts = async () => {
    const passLogPaths = getPassLogPaths(passLogPrefix);
    await cleanupFiles([pass1Output, ...passLogPaths], "ffmpeg pass logs");
  };

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

  const pass1Args = buildArgs(
    inputPath,
    pass1Output,
    options.modeId,
    options.modeConfig,
    profile,
    trimRange,
    {
      bitrateCapKbps,
      targetBitrateKbps,
      needsEvenDimensions,
      pass: 1,
      passLogFile: passLogPrefix,
      audioEnabledOverride: false
    }
  );
  const pass2Args = buildArgs(
    inputPath,
    outputPath,
    options.modeId,
    options.modeConfig,
    profile,
    trimRange,
    {
      bitrateCapKbps,
      targetBitrateKbps,
      needsEvenDimensions,
      pass: 2,
      passLogFile: passLogPrefix
    }
  );

  debug("ffmpeg pass1 args: %o", pass1Args);
  debug("ffmpeg pass2 args: %o", pass2Args);

  try {
    await spawnPass(pass1Args, "pass1", 0, 50, async (code, signal) => {
      if (canceled || code !== 0) {
        await cleanupPassArtifacts();
        callbacks.onClose(code, signal);
        return;
      }
      try {
        await spawnPass(pass2Args, "pass2", 50, 100, async (finalCode, finalSignal) => {
          await cleanupPassArtifacts();
          callbacks.onClose(finalCode, finalSignal);
        });
      } catch (error) {
        debug("ffmpeg pass2 spawn failed: %O", error);
        await cleanupPassArtifacts();
        throw error;
      }
    });
  } catch (error) {
    debug("ffmpeg pass1 spawn failed: %O", error);
    await cleanupPassArtifacts();
    throw error;
  }

  return {
    outputPath,
    jobId: undefined,
    cancel: async () => {
      canceled = true;
      if (activeChild) {
        await activeChild.kill();
      }
    }
  };
};
