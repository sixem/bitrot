// Shared constants + helpers for preview scrubbing and trim display.
import formatDuration from "@/utils/formatDuration";

// Shared helpers for the preview UI (scrubbing, trim display, keyboard checks).
export const MIN_SCRUB_STEP_SECONDS = 0.001;
export const TRIM_TRACK_BASE_COLOR = "#131313";
// Playback cadence for arrow-key holds.
export const HOLD_PLAYBACK_RATE = 1.0;
// Reverse has to be simulated, so step at the effective FPS rate.
export const MIN_REVERSE_STEP_INTERVAL_MS = 5;

// Ignore keyboard shortcuts when the user is typing or adjusting form fields.
export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

export const formatDurationSafe = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? formatDuration(value) : "--";

export const findNearestFrameIndex = (
  frames: ArrayLike<number>,
  timeSeconds: number
) => {
  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = frames[mid];
    if (midTime < timeSeconds) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (low <= 0) {
    return 0;
  }
  if (low >= frames.length) {
    return frames.length - 1;
  }

  const before = frames[low - 1];
  const after = frames[low];
  return timeSeconds - before <= after - timeSeconds ? low - 1 : low;
};

// Pick the smallest positive frame delta to keep scrubbing granular for VFR clips.
export const getMinFrameStep = (frames: ArrayLike<number> | null) => {
  if (!frames || frames.length < 2) {
    return undefined;
  }

  let minDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < frames.length; index += 1) {
    const delta = frames[index] - frames[index - 1];
    if (delta > 0 && delta < minDelta) {
      minDelta = delta;
    }
  }

  if (!Number.isFinite(minDelta) || minDelta <= 0) {
    return undefined;
  }

  return Math.max(MIN_SCRUB_STEP_SECONDS, minDelta);
};

// Build a scrubber gradient with a highlighted selection band.
export const buildTrimGradient = (
  startPct: number,
  endPct: number,
  highlight: string
) => {
  const base = TRIM_TRACK_BASE_COLOR;
  const stops = [
    `${base} 0%`,
    `${base} ${startPct}%`,
    `${highlight} ${startPct}%`,
    `${highlight} ${endPct}%`,
    `${base} ${endPct}%`,
    `${base} 100%`
  ];

  return `linear-gradient(90deg, ${stops.join(", ")})`;
};

export const getVfrWarningMessage = (
  isVfr: boolean,
  hasFrameMap: boolean,
  status: "idle" | "loading" | "ready" | "error",
  errorLabel?: string
) => {
  if (!isVfr || hasFrameMap) {
    return null;
  }
  if (status === "loading") {
    return "Variable FPS detected. Loading a frame map for accurate controls...";
  }
  if (status === "idle") {
    return "Variable FPS detected. Load a frame map for accurate controls.";
  }
  if (status === "error") {
    return errorLabel
      ? `Variable FPS detected. Frame map failed: ${errorLabel}`
      : "Variable FPS detected. Frame map failed to load.";
  }
  return "Variable FPS detected. Frame-accurate controls are disabled.";
};
