// Domain helpers for working with video inputs.
export type VideoAsset = {
  id: string;
  path: string;
  name: string;
};

const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm", ".avi"];

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `video-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getFileName = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
};

export const isSupportedVideoPath = (path: string) => {
  const lowerName = path.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

export const createVideoAssetFromPath = (path: string): VideoAsset => ({
  id: createId(),
  path,
  name: getFileName(path)
});

export const videoExtensionsLabel = () =>
  SUPPORTED_VIDEO_EXTENSIONS.map((ext) => ext.replace(".", "")).join(", ");
