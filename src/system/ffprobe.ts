import { Command } from "@tauri-apps/plugin-shell";
import makeDebug from "@/utils/debug";

export type VideoMetadata = {
  durationSeconds?: number;
  width?: number;
  height?: number;
  codec?: string;
  fps?: number;
  sizeBytes?: number;
};

const FFPROBE_SIDECAR = "binaries/ffprobe";
const debug = makeDebug("system:ffprobe");

type FfprobeStream = {
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
};

type FfprobeFormat = {
  duration?: string;
  size?: string;
};

type FfprobeResult = {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
};

const parseRate = (rate?: string) => {
  if (!rate || rate === "0/0") {
    return undefined;
  }

  const [num, den] = rate.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return undefined;
  }

  return num / den;
};

const parseNumber = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractMetadata = (payload: FfprobeResult): VideoMetadata => {
  const stream = payload.streams?.[0];
  const fps = parseRate(stream?.avg_frame_rate) ?? parseRate(stream?.r_frame_rate);

  return {
    durationSeconds: parseNumber(payload.format?.duration),
    width: stream?.width,
    height: stream?.height,
    codec: stream?.codec_name,
    fps,
    sizeBytes: parseNumber(payload.format?.size)
  };
};

const runFfprobe = async (args: string[]) => {
  debug("ffprobe args: %o", args);
  const command = Command.sidecar(FFPROBE_SIDECAR, args);
  const output = await command.execute();
  const raw = [output.stdout, output.stderr].filter(Boolean).join("\n").trim();
  return { output, raw };
};

const parseJson = (raw: string) => {
  try {
    return JSON.parse(raw) as FfprobeResult;
  } catch {
    return null;
  }
};

export const probeVideo = async (filePath: string) => {
  const normalizedPath = filePath.trim().replace(/^"+|"+$/g, "");
  if (!normalizedPath) {
    throw new Error("ffprobe received an empty file path.");
  }

  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height,avg_frame_rate,r_frame_rate:format=duration,size",
    "-of",
    "json",
    "--",
    normalizedPath
  ];
  const { output, raw } = await runFfprobe(args);
  const parsed = raw ? parseJson(raw) : null;

  if (output.code !== 0 && !parsed) {
    debug("probe failed: code=%s raw=%s", output.code, raw.slice(-1500));
    const message = raw.includes("You have to specify one input file")
      ? `ffprobe did not receive a file path (path: ${normalizedPath}). Raw output: ${raw}`
      : raw || "ffprobe failed to return metadata";
    throw new Error(message);
  }

  if (!parsed) {
    debug("probe parse failure: raw=%s", raw.slice(-1500));
    throw new Error("Unable to parse ffprobe output");
  }

  debug("probe success");
  return extractMetadata(parsed);
};

// Extracts codec extradata (e.g. VOL headers) from the container stream.
export const probeVideoExtradata = async (filePath: string) => {
  const normalizedPath = filePath.trim().replace(/^"+|"+$/g, "");
  if (!normalizedPath) {
    throw new Error("ffprobe received an empty file path.");
  }

  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=extradata",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    "--",
    normalizedPath
  ];

  const { output, raw } = await runFfprobe(args);
  if (output.code !== 0) {
    debug("probe extradata failed: code=%s raw=%s", output.code, raw.slice(-1500));
    throw new Error(raw || "ffprobe failed to return extradata");
  }

  const extradata = raw.trim();
  debug("probe extradata length=%d", extradata.length);
  return extradata || undefined;
};
