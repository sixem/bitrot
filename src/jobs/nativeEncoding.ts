// Shared encoding payload builder for native Rust pipelines.
import {
  resolveNvencPreset,
  resolveVp9Settings,
  resolveX264Preset,
  type ExportFormat,
  type ExportProfile,
  type VideoEncoder
} from "@/jobs/exportProfile";
import { parseExtraArgs } from "@/jobs/ffmpegArgs";

export type NativeEncoding = {
  encoder: VideoEncoder;
  preset: string;
  crf?: number;
  cq?: number;
  maxBitrateKbps?: number;
  targetBitrateKbps?: number;
  vp9Deadline?: string;
  vp9CpuUsed?: number;
  format: ExportFormat;
  audioEnabled: boolean;
  audioCodec?: string;
  audioBitrateKbps?: number;
  // Safe extra args split for native encode + mux steps.
  extraEncodeArgs: string[];
  extraMuxArgs: string[];
};

const resolveAudioCodec = (format: ExportFormat) =>
  format === "webm" ? "opus" : "aac";

const resolveAudioBitrateKbps = (format: ExportFormat) =>
  format === "webm" ? 160 : 192;

const isMuxOnlyFlag = (flag: string) => flag === "-movflags";

const splitNativeExtraArgs = (args: string[]) => {
  const extraEncodeArgs: string[] = [];
  const extraMuxArgs: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || value === undefined) {
      continue;
    }
    if (isMuxOnlyFlag(flag)) {
      extraMuxArgs.push(flag, value);
    } else {
      extraEncodeArgs.push(flag, value);
    }
  }
  return { extraEncodeArgs, extraMuxArgs };
};

// Builds the payload used by native Rust pipelines for encoding.
export const buildNativeEncoding = (
  profile: ExportProfile,
  options: { targetBitrateKbps?: number; bitrateCapKbps?: number } = {}
): NativeEncoding => {
  const { targetBitrateKbps, bitrateCapKbps } = options;
  const maxBitrateKbps = targetBitrateKbps ?? bitrateCapKbps;
  const vp9Settings =
    profile.videoEncoder === "libvpx-vp9"
      ? resolveVp9Settings(profile.videoSpeed)
      : null;
  const preset =
    profile.videoEncoder === "h264_nvenc"
      ? resolveNvencPreset(profile.videoSpeed)
      : profile.videoEncoder === "libvpx-vp9"
        ? vp9Settings?.deadline ?? "good"
        : resolveX264Preset(profile.videoSpeed);
  const parsedExtraArgs = parseExtraArgs(profile.extraArgs);
  const { extraEncodeArgs, extraMuxArgs } = splitNativeExtraArgs(parsedExtraArgs);

  return {
    encoder: profile.videoEncoder,
    preset,
    crf:
      profile.videoEncoder === "libx264" ||
      profile.videoEncoder === "libvpx-vp9"
        ? profile.quality
        : undefined,
    cq: profile.videoEncoder === "h264_nvenc" ? profile.quality : undefined,
    maxBitrateKbps,
    targetBitrateKbps,
    vp9Deadline: profile.videoEncoder === "libvpx-vp9" ? vp9Settings?.deadline : undefined,
    vp9CpuUsed: profile.videoEncoder === "libvpx-vp9" ? vp9Settings?.cpuUsed : undefined,
    format: profile.format,
    audioEnabled: profile.audioEnabled,
    audioCodec: profile.audioEnabled ? resolveAudioCodec(profile.format) : undefined,
    audioBitrateKbps: profile.audioEnabled
      ? resolveAudioBitrateKbps(profile.format)
      : undefined,
    extraEncodeArgs,
    extraMuxArgs
  };
};
