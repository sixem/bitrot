// Shared ffmpeg argument helpers to keep encoding behavior consistent.

// libx264 requires even dimensions; we trim odd pixels safely when needed.
export const SAFE_SCALE_FILTER = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1";

export const getExtension = (path: string) => {
  const clean = path.trim().toLowerCase();
  const dotIndex = clean.lastIndexOf(".");
  return dotIndex >= 0 ? clean.slice(dotIndex + 1) : "";
};

export const buildAudioArgs = (outputPath: string) => {
  const extension = getExtension(outputPath);
  if (extension === "mp4" || extension === "m4v") {
    return ["-c:a", "aac", "-b:a", "192k"];
  }
  return ["-c:a", "copy"];
};

export const buildContainerArgs = (outputPath: string) => {
  const extension = getExtension(outputPath);
  return extension === "mp4" || extension === "m4v"
    ? ["-movflags", "+faststart"]
    : [];
};
