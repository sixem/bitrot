import { invoke } from "@tauri-apps/api/core";
import makeDebug from "@/utils/debug";

const debug = makeDebug("system:reveal");

// Opens the containing folder in the OS file manager.
export const revealInFolder = async (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Reveal path is empty.");
  }
  try {
    await invoke("reveal_in_folder", { path: trimmed });
  } catch (error) {
    debug("reveal failed: %O", error);
    throw error;
  }
};
