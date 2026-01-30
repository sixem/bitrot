// Tests for shared ffmpeg argument helpers.
import { describe, expect, it } from "vitest";
import {
  SAFE_SCALE_FILTER,
  getExtension,
  buildAudioArgs,
  buildContainerArgs,
  parseExtraArgs
} from "@/jobs/ffmpegArgs";

describe("ffmpegArgs", () => {
  it("uses the expected even-dimension scale filter", () => {
    expect(SAFE_SCALE_FILTER).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1");
  });

  it("uses AAC audio for mp4/m4v/mov outputs", () => {
    expect(buildAudioArgs("clip.mp4")).toEqual(["-c:a", "aac", "-b:a", "192k"]);
    expect(buildAudioArgs("clip.m4v")).toEqual(["-c:a", "aac", "-b:a", "192k"]);
    expect(buildAudioArgs("clip.mov")).toEqual(["-c:a", "aac", "-b:a", "192k"]);
  });

  it("uses Opus audio for webm outputs", () => {
    expect(buildAudioArgs("clip.webm")).toEqual(["-c:a", "libopus", "-b:a", "160k"]);
  });

  it("uses AAC audio for mkv outputs", () => {
    expect(buildAudioArgs("clip.mkv")).toEqual(["-c:a", "aac", "-b:a", "192k"]);
  });

  it("adds faststart for mp4/m4v/mov outputs", () => {
    expect(buildContainerArgs("clip.mp4")).toEqual(["-movflags", "+faststart"]);
    expect(buildContainerArgs("clip.m4v")).toEqual(["-movflags", "+faststart"]);
    expect(buildContainerArgs("clip.mov")).toEqual(["-movflags", "+faststart"]);
  });

  it("leaves container args empty for other extensions", () => {
    expect(buildContainerArgs("clip.webm")).toEqual([]);
  });

  it("extracts lowercase extensions from paths", () => {
    expect(getExtension("clip.MP4")).toBe("mp4");
    expect(getExtension("  /tmp/clip.m4v  ")).toBe("m4v");
    expect(getExtension("no-extension")).toBe("");
  });

  it("filters extra args to the safe allowlist", () => {
    const raw = "-tune film -vf hue=s=0 -profile:v high -g 60 -nope 123";
    expect(parseExtraArgs(raw)).toEqual([
      "-tune",
      "film",
      "-profile:v",
      "high",
      "-g",
      "60"
    ]);
  });

  it("preserves quoted values for extra args", () => {
    const raw = "-tune \"film\" -movflags \"+faststart\"";
    expect(parseExtraArgs(raw)).toEqual(["-tune", "film", "-movflags", "+faststart"]);
  });
});
