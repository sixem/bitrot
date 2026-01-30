// Shared helpers for native pipelines that operate on decoded frames.

export const resolveNativeFps = (avgFps?: number, nominalFps?: number) => {
  if (
    typeof avgFps === "number" &&
    typeof nominalFps === "number" &&
    Number.isFinite(avgFps) &&
    Number.isFinite(nominalFps) &&
    nominalFps > avgFps * 1.4
  ) {
    return nominalFps;
  }
  if (typeof avgFps === "number" && Number.isFinite(avgFps) && avgFps > 0) {
    return avgFps;
  }
  if (
    typeof nominalFps === "number" &&
    Number.isFinite(nominalFps) &&
    nominalFps > 0
  ) {
    return nominalFps;
  }
  return 30;
};

export const resolveEvenDimensions = (width?: number, height?: number) => {
  if (!width || !height) {
    throw new Error("ffprobe did not return video dimensions.");
  }
  const safeWidth = width - (width % 2);
  const safeHeight = height - (height % 2);
  if (safeWidth <= 0 || safeHeight <= 0) {
    throw new Error("Native pipeline received invalid video dimensions.");
  }
  return {
    width: safeWidth,
    height: safeHeight,
    adjusted: safeWidth !== width || safeHeight !== height
  };
};
