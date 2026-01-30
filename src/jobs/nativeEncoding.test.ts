// Tests for native encoding payload construction.
import { describe, expect, it } from "vitest";
import { buildNativeEncoding } from "@/jobs/nativeEncoding";
import type { ExportProfile } from "@/jobs/exportProfile";

describe("nativeEncoding", () => {
  it("splits safe extra args between encode and mux phases", () => {
    const profile: ExportProfile = {
      format: "mp4",
      videoMode: "encode",
      videoEncoder: "libx264",
      videoSpeed: "balanced",
      quality: 20,
      passMode: "auto",
      sizeCapMb: undefined,
      audioEnabled: true,
      extraArgs: "-threads 8 -movflags +faststart -tune film -vf hue=s=0"
    };

    const payload = buildNativeEncoding(profile);
    expect(payload.extraEncodeArgs).toEqual(["-threads", "8", "-tune", "film"]);
    expect(payload.extraMuxArgs).toEqual(["-movflags", "+faststart"]);
  });

  it("sets audio codec defaults based on format", () => {
    const webmProfile: ExportProfile = {
      format: "webm",
      videoMode: "encode",
      videoEncoder: "libvpx-vp9",
      videoSpeed: "balanced",
      quality: 30,
      passMode: "auto",
      sizeCapMb: undefined,
      audioEnabled: true,
      extraArgs: ""
    };

    const payload = buildNativeEncoding(webmProfile);
    expect(payload.audioCodec).toBe("opus");
    expect(payload.audioBitrateKbps).toBe(160);
  });
});
