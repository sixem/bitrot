// Tests for shared native video helpers.
import { describe, expect, it } from "vitest";
import { resolveNativeFps, resolveEvenDimensions } from "@/jobs/nativeVideo";

describe("nativeVideo", () => {
  it("prefers nominal fps when it is meaningfully higher than avg", () => {
    expect(resolveNativeFps(24, 60)).toBe(60);
  });

  it("falls back to avg fps when nominal is not dominant", () => {
    expect(resolveNativeFps(30, 35)).toBe(30);
  });

  it("falls back to nominal when avg is missing", () => {
    expect(resolveNativeFps(undefined, 29.97)).toBe(29.97);
  });

  it("uses a safe default when fps values are invalid", () => {
    expect(resolveNativeFps(undefined, undefined)).toBe(30);
    expect(resolveNativeFps(0, 0)).toBe(30);
  });

  it("normalizes odd dimensions down to even values", () => {
    expect(resolveEvenDimensions(1919, 1079)).toEqual({
      width: 1918,
      height: 1078,
      adjusted: true
    });
  });

  it("throws when dimensions are missing", () => {
    expect(() => resolveEvenDimensions(undefined, 1080)).toThrow();
    expect(() => resolveEvenDimensions(1920, undefined)).toThrow();
  });
});
