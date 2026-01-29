// Tests for shared ffmpeg argument helpers.
import { describe, expect, it } from "vitest";
import {
  SAFE_SCALE_FILTER,
  buildAudioArgs,
  buildContainerArgs
} from "@/jobs/ffmpegArgs";

describe("ffmpegArgs", () => {
  it("uses the expected even-dimension scale filter", () => {
    expect(SAFE_SCALE_FILTER).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1");
  });

  it("uses AAC audio for mp4/m4v outputs", () => {
    expect(buildAudioArgs("clip.mp4")).toEqual(["-c:a", "aac", "-b:a", "192k"]);
    expect(buildAudioArgs("clip.m4v")).toEqual(["-c:a", "aac", "-b:a", "192k"]);
  });

  it("copies audio for non-mp4 containers", () => {
    expect(buildAudioArgs("clip.mkv")).toEqual(["-c:a", "copy"]);
    expect(buildAudioArgs("clip.mov")).toEqual(["-c:a", "copy"]);
  });

  it("adds faststart for mp4/m4v outputs", () => {
    expect(buildContainerArgs("clip.mp4")).toEqual(["-movflags", "+faststart"]);
    expect(buildContainerArgs("clip.m4v")).toEqual(["-movflags", "+faststart"]);
  });

  it("leaves container args empty for other extensions", () => {
    expect(buildContainerArgs("clip.webm")).toEqual([]);
  });
});
