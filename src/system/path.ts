// Shared path helpers for shell and ffmpeg interactions.

export const sanitizePath = (value: string) =>
  value.trim().replace(/^"+|"+$/g, "");
