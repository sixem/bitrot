// Shared export profile types and helpers for the export workflow.
// Keeps UI and job runners aligned on supported formats + encoder defaults.

export type ExportFormat = "mp4" | "webm" | "mkv" | "mov";

export type VideoEncoder = "libx264" | "h264_nvenc" | "libvpx-vp9";

export type VideoMode = "copy" | "encode";

export type VideoSpeed = "fast" | "balanced" | "quality";

export type PassMode = "auto" | "1pass" | "2pass";

export type ExportProfile = {
  format: ExportFormat;
  videoMode: VideoMode;
  videoEncoder: VideoEncoder;
  videoSpeed: VideoSpeed;
  // Quality is CRF for x264/VP9 or CQ for NVENC.
  quality: number;
  passMode: PassMode;
  // Optional size target used to compute bitrate caps (MB).
  sizeCapMb?: number;
  audioEnabled: boolean;
  // Extra ffmpeg args appended after validated flags.
  extraArgs: string;
};

export const EXPORT_FORMATS: ExportFormat[] = ["mp4", "webm", "mkv", "mov"];

export const getFormatLabel = (format: ExportFormat) => format.toUpperCase();

export const getFormatExtension = (format: ExportFormat) => format;

export const getVideoEncoderLabel = (encoder: VideoEncoder) => {
  if (encoder === "libx264") {
    return "H.264 (libx264)";
  }
  if (encoder === "h264_nvenc") {
    return "H.264 (NVENC)";
  }
  return "VP9 (libvpx)";
};

export const getVideoSpeedLabel = (speed: VideoSpeed) => {
  if (speed === "fast") {
    return "Fast";
  }
  if (speed === "quality") {
    return "Quality";
  }
  return "Balanced";
};

export const getQualityLabel = (encoder: VideoEncoder) =>
  encoder === "h264_nvenc" ? "CQ" : "CRF";

export const getQualityRange = (encoder: VideoEncoder) => {
  if (encoder === "h264_nvenc") {
    return { min: 14, max: 28, step: 1, defaultValue: 19 };
  }
  if (encoder === "libvpx-vp9") {
    return { min: 18, max: 36, step: 1, defaultValue: 30 };
  }
  return { min: 16, max: 30, step: 1, defaultValue: 20 };
};

export const clampQuality = (encoder: VideoEncoder, value: number) => {
  const range = getQualityRange(encoder);
  if (!Number.isFinite(value)) {
    return range.defaultValue;
  }
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
};

export const getAllowedEncoders = (
  format: ExportFormat,
  nvencAvailable: boolean
): VideoEncoder[] => {
  const base: VideoEncoder[] = [];
  if (format === "webm") {
    return ["libvpx-vp9"];
  }
  if (format === "mkv") {
    base.push("libx264", "libvpx-vp9");
  } else {
    base.push("libx264");
  }
  if (nvencAvailable) {
    base.push("h264_nvenc");
  }
  return base;
};

export const resolveEncoderForFormat = (
  format: ExportFormat,
  encoder: VideoEncoder,
  nvencAvailable: boolean
): VideoEncoder => {
  const allowed = getAllowedEncoders(format, nvencAvailable);
  return allowed.includes(encoder) ? encoder : allowed[0];
};

export const DEFAULT_EXPORT_PROFILE: ExportProfile = {
  format: "mp4",
  videoMode: "encode",
  videoEncoder: "libx264",
  videoSpeed: "balanced",
  quality: getQualityRange("libx264").defaultValue,
  passMode: "auto",
  sizeCapMb: undefined,
  audioEnabled: true,
  extraArgs: ""
};

export const normalizeProfile = (
  profile: ExportProfile,
  nvencAvailable: boolean
): ExportProfile => {
  const resolvedEncoder = resolveEncoderForFormat(
    profile.format,
    profile.videoEncoder,
    nvencAvailable
  );
  return {
    ...profile,
    videoEncoder: resolvedEncoder,
    quality: clampQuality(resolvedEncoder, profile.quality)
  };
};

export const resolveX264Preset = (speed: VideoSpeed) => {
  if (speed === "fast") {
    return "ultrafast";
  }
  if (speed === "quality") {
    return "slow";
  }
  return "veryfast";
};

export const resolveNvencPreset = (speed: VideoSpeed) => {
  if (speed === "fast") {
    return "p1";
  }
  if (speed === "quality") {
    return "p6";
  }
  return "p4";
};

export const resolveVp9Settings = (speed: VideoSpeed) => {
  if (speed === "fast") {
    return { cpuUsed: 6, deadline: "realtime" };
  }
  if (speed === "quality") {
    return { cpuUsed: 2, deadline: "good" };
  }
  return { cpuUsed: 4, deadline: "good" };
};
