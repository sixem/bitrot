// Encoding helpers shared across ffmpeg-driven pipelines.
import {
  clampQuality,
  resolveNvencPreset,
  resolveVp9Settings,
  resolveX264Preset,
  type ExportProfile,
  type VideoEncoder
} from "@/jobs/exportProfile";

const DEFAULT_BITRATE_CAP_MULTIPLIER = 1.5;
const MIN_BITRATE_CAP_KBPS = 1200;

// Adds a VBV ceiling so highly detailed frames do not explode output sizes.
const buildBitrateCapArgs = (bitrateCapKbps?: number) => {
  if (!Number.isFinite(bitrateCapKbps) || bitrateCapKbps === undefined) {
    return [];
  }
  const maxrate = Math.max(MIN_BITRATE_CAP_KBPS, Math.round(bitrateCapKbps));
  const bufsize = Math.max(maxrate * 2, MIN_BITRATE_CAP_KBPS * 2);
  return ["-maxrate", `${maxrate}k`, "-bufsize", `${bufsize}k`];
};

// Estimate a sane cap based on the input bitrate with a preset-specific multiplier.
export const estimateInputBitrateCapKbps = (
  sizeBytes?: number,
  durationSeconds?: number,
  multiplier = DEFAULT_BITRATE_CAP_MULTIPLIER
) => {
  if (!Number.isFinite(sizeBytes) || !Number.isFinite(durationSeconds)) {
    return undefined;
  }
  if (!sizeBytes || !durationSeconds || durationSeconds <= 0) {
    return undefined;
  }
  const inputKbps = (sizeBytes * 8) / (durationSeconds * 1000);
  if (!Number.isFinite(inputKbps) || inputKbps <= 0) {
    return undefined;
  }
  return Math.max(MIN_BITRATE_CAP_KBPS, Math.round(inputKbps * multiplier));
};

export const estimateTargetBitrateKbps = (
  sizeCapMb?: number,
  durationSeconds?: number
) => {
  if (!Number.isFinite(sizeCapMb) || sizeCapMb === undefined) {
    return undefined;
  }
  if (!durationSeconds || durationSeconds <= 0) {
    return undefined;
  }
  const sizeBytes = sizeCapMb * 1024 * 1024;
  const kbps = (sizeBytes * 8) / (durationSeconds * 1000);
  return Number.isFinite(kbps) && kbps > 0 ? Math.round(kbps) : undefined;
};

type VideoEncodingArgsOptions = {
  bitrateCapKbps?: number;
  targetBitrateKbps?: number;
  pass?: 1 | 2;
  passLogFile?: string;
};

export const buildVideoEncodingArgs = (
  profile: ExportProfile,
  options: VideoEncodingArgsOptions = {}
) => {
  const encoder: VideoEncoder = profile.videoEncoder;
  const { bitrateCapKbps, targetBitrateKbps, pass, passLogFile } = options;

  if (encoder === "h264_nvenc") {
    const cq = clampQuality("h264_nvenc", profile.quality);
    const args = [
      "-c:v",
      "h264_nvenc",
      "-preset",
      resolveNvencPreset(profile.videoSpeed),
      "-rc",
      "vbr",
      "-cq",
      `${cq}`,
      "-b:v",
      "0"
    ];
    return [...args, ...buildBitrateCapArgs(bitrateCapKbps)];
  }

  if (encoder === "libvpx-vp9") {
    const { cpuUsed, deadline } = resolveVp9Settings(profile.videoSpeed);
    const args = [
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      deadline,
      "-cpu-used",
      `${cpuUsed}`,
      "-row-mt",
      "1"
    ];
    if (targetBitrateKbps) {
      args.push("-b:v", `${targetBitrateKbps}k`);
    } else {
      const crf = clampQuality("libvpx-vp9", profile.quality);
      args.push("-crf", `${crf}`, "-b:v", "0");
    }
    if (pass && passLogFile) {
      args.push("-pass", `${pass}`, "-passlogfile", passLogFile);
    }
    return args;
  }

  const crf = clampQuality("libx264", profile.quality);
  return [
    "-c:v",
    "libx264",
    "-preset",
    resolveX264Preset(profile.videoSpeed),
    "-crf",
    `${crf}`,
    ...buildBitrateCapArgs(bitrateCapKbps)
  ];
};
