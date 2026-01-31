// Shared ffmpeg argument builders for the core runner.
import { SAFE_SCALE_FILTER, buildAudioArgs, buildContainerArgs, parseExtraArgs } from "@/jobs/ffmpegArgs";
import { buildVideoEncodingArgs } from "@/jobs/exportEncoding";
import { getModeDefinition, type ModeConfigMap, type ModeId } from "@/modes/definitions";
import type { ExportProfile } from "@/jobs/exportProfile";
import type { TrimRange } from "@/jobs/trim";

type BuildArgsOptions = {
  modeId?: ModeId;
  modeConfig?: ModeConfigMap[ModeId];
  profile: ExportProfile;
  trimRange?: TrimRange;
  bitrateCapKbps?: number;
  targetBitrateKbps?: number;
  needsEvenDimensions?: boolean;
  pass?: 1 | 2;
  passLogFile?: string;
  audioEnabledOverride?: boolean;
  includeProgress?: boolean;
};

// Convert a trim range into ffmpeg -ss/-to args.
const buildTrimArgs = (range?: TrimRange) => {
  if (!range) {
    return [];
  }
  return ["-ss", range.start.toFixed(3), "-to", range.end.toFixed(3)];
};

// Assemble input args with explicit stream mapping and trim.
const buildInputArgs = (
  inputPath: string,
  trimRange: TrimRange | undefined,
  audioEnabled: boolean
) => {
  const args = ["-y", "-hide_banner", "-i", inputPath, ...buildTrimArgs(trimRange)];
  args.push("-map", "0:v:0");
  if (audioEnabled) {
    args.push("-map", "0:a?");
  }
  return args;
};

// Build video filters (mode filter + scale correction).
const buildFilterArgs = (
  modeId: ModeId | undefined,
  modeConfig: ModeConfigMap[ModeId] | undefined,
  shouldCopy: boolean,
  needsEvenDimensions: boolean
) => {
  const mode = getModeDefinition(modeId);
  const resolvedConfig = modeConfig ?? mode.defaultConfig;
  const filters: string[] = [];
  if (mode.buildFilter) {
    filters.push(mode.buildFilter(resolvedConfig));
  }
  if (!shouldCopy && needsEvenDimensions) {
    filters.push(SAFE_SCALE_FILTER);
  }
  return filters.length > 0 ? ["-vf", filters.join(",")] : [];
};

// Build audio output args based on copy/encode paths.
const buildAudioOutputArgs = (
  outputPath: string,
  audioEnabled: boolean,
  shouldCopy: boolean
) => {
  if (!audioEnabled) {
    return ["-an"];
  }
  if (shouldCopy) {
    return ["-c:a", "copy"];
  }
  return buildAudioArgs(outputPath, { enabled: true });
};

// Build output args (progress pipe + output path).
const buildOutputArgs = (outputPath: string, includeProgress: boolean) => {
  const args: string[] = [];
  if (includeProgress) {
    args.push("-progress", "pipe:1", "-nostats");
  }
  args.push(outputPath);
  return args;
};

// Build a full ffmpeg argument list for the shared runner path.
const buildFfmpegArgs = (
  inputPath: string,
  outputPath: string,
  options: BuildArgsOptions
) => {
  const mode = getModeDefinition(options.modeId);
  const resolvedConfig = options.modeConfig ?? mode.defaultConfig;
  const shouldCopy =
    options.profile.videoMode === "copy" && !options.trimRange && !mode.buildFilter;
  const needsEvenDimensions = options.needsEvenDimensions ?? true;
  const audioEnabled = options.audioEnabledOverride ?? options.profile.audioEnabled ?? true;
  const bitrateCap = options.targetBitrateKbps ?? options.bitrateCapKbps;
  const includeProgress = options.includeProgress !== false;

  const args = buildInputArgs(inputPath, options.trimRange, audioEnabled);
  args.push(
    ...buildFilterArgs(
      mode.id,
      resolvedConfig,
      shouldCopy,
      needsEvenDimensions
    )
  );

  const extraArgs = parseExtraArgs(options.profile.extraArgs);

  if (shouldCopy) {
    args.push("-c:v", "copy");
    args.push(...buildAudioOutputArgs(outputPath, audioEnabled, true));
    args.push(...buildContainerArgs(outputPath));
    if (extraArgs.length > 0) {
      args.push(...extraArgs);
    }
    args.push(...buildOutputArgs(outputPath, includeProgress));
    return args;
  }

  args.push(
    ...buildVideoEncodingArgs(options.profile, {
      bitrateCapKbps: bitrateCap,
      targetBitrateKbps: options.targetBitrateKbps,
      pass: options.pass,
      passLogFile: options.passLogFile
    }),
    "-pix_fmt",
    "yuv420p",
    ...buildAudioOutputArgs(outputPath, audioEnabled, false),
    ...buildContainerArgs(outputPath)
  );

  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  args.push(...buildOutputArgs(outputPath, includeProgress));
  return args;
};

export { buildFfmpegArgs };
export type { BuildArgsOptions };
