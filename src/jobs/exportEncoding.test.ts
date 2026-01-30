// Tests for shared encoding argument builders.
import { describe, expect, it } from "vitest";
import {
  buildVideoEncodingArgs,
  estimateInputBitrateCapKbps,
  estimateTargetBitrateKbps
} from "@/jobs/exportEncoding";
import type { ExportProfile, VideoEncoder } from "@/jobs/exportProfile";

const buildProfile = (encoder: VideoEncoder): ExportProfile => ({
  format: "mp4",
  videoMode: "encode",
  videoEncoder: encoder,
  videoSpeed: "fast",
  quality: 22,
  passMode: "auto",
  sizeCapMb: undefined,
  audioEnabled: true,
  extraArgs: ""
});

describe("exportEncoding", () => {
  it("estimates input bitrate caps deterministically", () => {
    const cap = estimateInputBitrateCapKbps(10_000_000, 10);
    // 10MB over 10s ~ 8000 kbps with 1.5x multiplier -> 12000 kbps.
    expect(cap).toBe(12000);
  });

  it("estimates target bitrate from size caps", () => {
    const target = estimateTargetBitrateKbps(10, 20);
    // 10 MiB over 20s -> ~4194 kbps.
    expect(target).toBe(4194);
  });

  it("builds x264 args with bitrate caps", () => {
    const profile = buildProfile("libx264");
    const args = buildVideoEncodingArgs(profile, { bitrateCapKbps: 2000 });
    expect(args).toEqual([
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-maxrate",
      "2000k",
      "-bufsize",
      "4000k"
    ]);
  });

  it("builds nvenc args with CQ and caps", () => {
    const profile = buildProfile("h264_nvenc");
    const args = buildVideoEncodingArgs(profile, { bitrateCapKbps: 2500 });
    expect(args).toEqual([
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p1",
      "-rc",
      "vbr",
      "-cq",
      "22",
      "-b:v",
      "0",
      "-maxrate",
      "2500k",
      "-bufsize",
      "5000k"
    ]);
  });

  it("builds vp9 args with target bitrate and pass settings", () => {
    const profile = buildProfile("libvpx-vp9");
    const args = buildVideoEncodingArgs(profile, {
      targetBitrateKbps: 1800,
      pass: 2,
      passLogFile: "passlog"
    });
    expect(args).toEqual([
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "6",
      "-row-mt",
      "1",
      "-b:v",
      "1800k",
      "-pass",
      "2",
      "-passlogfile",
      "passlog"
    ]);
  });
});
