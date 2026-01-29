// ffprobe wrapper that streams a minimal frame map from the Rust side.
import { invoke } from "@tauri-apps/api/core";

export type FrameMapPayload = {
  times: number[];
  keyframeTimes: number[];
  durationSeconds?: number;
};

// Pulls frame times with a streaming Rust parser to avoid huge JSON payloads.
export const probeFrameMap = async (
  filePath: string
): Promise<FrameMapPayload> => {
  const normalizedPath = filePath.trim().replace(/^"+|"+$/g, "");
  if (!normalizedPath) {
    throw new Error("ffprobe received an empty file path.");
  }

  return invoke<FrameMapPayload>("ffprobe_frame_map", {
    path: normalizedPath
  });
};
