import { invoke } from "@tauri-apps/api/core";
import { sanitizePath } from "@/system/path";
import makeDebug from "@/utils/debug";

// Shared file cleanup helper for temp/preview artifacts.
const debug = makeDebug("system:cleanup");

const uniquePaths = (paths: string[]) => {
  const seen = new Set<string>();
  return paths.filter((path) => {
    if (!path || seen.has(path)) {
      return false;
    }
    seen.add(path);
    return true;
  });
};

const normalizePaths = (paths: string[]) =>
  uniquePaths(
    paths
      .map((path) => sanitizePath(path).trim())
      .filter((path) => path.length > 0)
  );

export const cleanupFiles = async (paths: string[], label?: string) => {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) {
    return true;
  }
  try {
    await invoke("cleanup_files", { paths: normalized });
    return true;
  } catch (error) {
    debug("cleanup failed%s: %O", label ? ` (${label})` : "", error);
    return false;
  }
};
