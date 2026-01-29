import { invoke } from "@tauri-apps/api/core";

// Checks whether a filesystem path exists on disk.
export const pathExists = async (path: string): Promise<boolean | null> => {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  try {
    return await invoke<boolean>("path_exists", { path: trimmed });
  } catch {
    return null;
  }
};
