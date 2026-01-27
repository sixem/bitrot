// ffprobe wrapper for extracting per-frame data from the ffmpeg sidecar.
import { Command } from "@tauri-apps/plugin-shell";

export type FfprobeFrame = {
  key_frame?: number;
  pict_type?: string;
  pkt_pts_time?: string;
  best_effort_timestamp_time?: string;
  coded_picture_number?: number;
};

export type FfprobeFramesResult = {
  frames?: FfprobeFrame[];
  format?: {
    duration?: string;
  };
};

const FFPROBE_SIDECAR = "binaries/ffprobe";

const parseJson = (raw: string) => {
  try {
    return JSON.parse(raw) as FfprobeFramesResult;
  } catch {
    return null;
  }
};

// Pulls per-frame data from ffprobe so downstream modes can build a frame map.
export const probeFrames = async (filePath: string) => {
  const normalizedPath = filePath.trim().replace(/^"+|"+$/g, "");
  if (!normalizedPath) {
    throw new Error("ffprobe received an empty file path.");
  }

  const command = Command.sidecar(FFPROBE_SIDECAR, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "frame=key_frame,pict_type,pkt_pts_time,best_effort_timestamp_time,coded_picture_number:format=duration",
    "-of",
    "json",
    "--",
    normalizedPath
  ]);

  const output = await command.execute();
  const raw = [output.stdout, output.stderr].filter(Boolean).join("\n").trim();
  const parsed = raw ? parseJson(raw) : null;

  if (output.code !== 0 && !parsed) {
    const message = raw || "ffprobe failed to return frame data";
    throw new Error(message);
  }

  if (!parsed) {
    throw new Error("Unable to parse ffprobe frame output");
  }

  return parsed;
};
