// Shared frame map structures used by future processing modes.
import type { FfprobeFrame, FfprobeFramesResult } from "@/system/ffprobeFrames";

export type FrameKind = "I" | "P" | "B" | "Unknown";

export type FrameEntry = {
  index: number;
  timeSeconds: number;
  keyframe: boolean;
  kind: FrameKind;
};

export type FrameMap = {
  frames: FrameEntry[];
  keyframes: FrameEntry[];
  durationSeconds?: number;
};

const parseNumber = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeFrameKind = (raw?: string): FrameKind => {
  switch (raw?.toUpperCase()) {
    case "I":
      return "I";
    case "P":
      return "P";
    case "B":
      return "B";
    default:
      return "Unknown";
  }
};

const resolveFrameTime = (frame: FfprobeFrame) =>
  parseNumber(frame.pkt_pts_time) ?? parseNumber(frame.best_effort_timestamp_time);

const toFrameEntry = (frame: FfprobeFrame, fallbackIndex: number): FrameEntry | null => {
  const timeSeconds = resolveFrameTime(frame);
  if (!Number.isFinite(timeSeconds)) {
    return null;
  }

  const codedIndex = Number(frame.coded_picture_number);
  const index = Number.isFinite(codedIndex) ? codedIndex : fallbackIndex;

  return {
    index,
    timeSeconds,
    keyframe: Number(frame.key_frame) === 1,
    kind: normalizeFrameKind(frame.pict_type)
  };
};

// Normalizes ffprobe output into a stable frame map for future processing modes.
export const buildFrameMap = (payload: FfprobeFramesResult): FrameMap => {
  const entries = (payload.frames ?? [])
    .map((frame, idx) => toFrameEntry(frame, idx))
    .filter((frame): frame is FrameEntry => Boolean(frame))
    .sort((left, right) => left.timeSeconds - right.timeSeconds);

  const keyframes = entries.filter(
    (frame) => frame.keyframe || frame.kind === "I"
  );

  return {
    frames: entries,
    keyframes,
    durationSeconds: parseNumber(payload.format?.duration)
  };
};
