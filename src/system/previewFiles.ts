import { cleanupFiles } from "@/system/cleanup";
import { sanitizePath } from "@/system/path";

// Tracks preview artifacts so we can clean them up on clear/close.
const previewFiles = new Set<string>();

const normalizePreviewPath = (path: string) => sanitizePath(path).trim();

export const registerPreviewFile = (path: string) => {
  const normalized = normalizePreviewPath(path);
  if (!normalized) {
    return;
  }
  previewFiles.add(normalized);
};

export const cleanupPreviewFile = async (path: string, reason?: string) => {
  const normalized = normalizePreviewPath(path);
  if (!normalized) {
    return true;
  }
  previewFiles.delete(normalized);
  return cleanupFiles([normalized], reason ?? "preview cleanup");
};

export const cleanupAllPreviewFiles = async (reason?: string) => {
  if (previewFiles.size === 0) {
    return true;
  }
  const paths = [...previewFiles];
  previewFiles.clear();
  return cleanupFiles(paths, reason ?? "preview cleanup");
};
