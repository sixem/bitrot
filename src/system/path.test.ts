// Tests for shared path normalization helpers.
import { describe, expect, it } from "vitest";
import { sanitizePath } from "@/system/path";

describe("sanitizePath", () => {
  it("trims whitespace and strips surrounding quotes", () => {
    expect(sanitizePath('  "C:\\\\video\\\\clip.mp4"  ')).toBe(
      "C:\\\\video\\\\clip.mp4"
    );
  });

  it("handles already-clean paths", () => {
    expect(sanitizePath("/home/user/clip.mov")).toBe("/home/user/clip.mov");
  });
});
