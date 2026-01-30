// Shared time helpers for scrub and trim math.

export const clampTime = (value: number, duration?: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (!Number.isFinite(duration)) {
    return Math.max(0, value);
  }
  return Math.min(Math.max(0, value), Math.max(0, duration ?? 0));
};
