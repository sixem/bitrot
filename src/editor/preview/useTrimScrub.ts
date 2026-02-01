// Manages trim selection state, labels, and scrubber highlights.
import { useCallback, useMemo, useRef } from "react";
import { clampTime } from "@/utils/time";
import formatDuration from "@/utils/formatDuration";
import type { TrimControl } from "@/editor/preview/types";
import { buildTrimGradient } from "@/editor/preview/utils";
import {
  TRIM_HIGHLIGHT_ACTIVE,
  TRIM_HIGHLIGHT_IDLE
} from "@/editor/preview/previewTheme";
import {
  buildTrimInfoLines,
  getTrimSelectionFlags
} from "@/editor/preview/trimSelection";

type UseTrimScrubArgs = {
  trim?: TrimControl;
  currentTime: number;
  resolvedDuration?: number;
  isPassthroughMode: boolean;
  controlsDisabled: boolean;
  resolveFrameIndex: (timeSeconds: number) => number | undefined;
  resolveTimeForFrame: (frame: number) => number | undefined;
  clampFrameIndex: (frame: number) => number;
};

// Handles trim selection state, labels, and scrubber track highlighting.
const useTrimScrub = ({
  trim,
  currentTime,
  resolvedDuration,
  isPassthroughMode,
  controlsDisabled,
  resolveFrameIndex,
  resolveTimeForFrame,
  clampFrameIndex
}: UseTrimScrubArgs) => {
  const lastMarkEdgeRef = useRef<"start" | "end">("end");
  const trimSelection = trim?.selection;
  const { trimHasRange, trimEnabled } = getTrimSelectionFlags(trimSelection);
  const showPassthroughTrimWarning = isPassthroughMode && trimEnabled;

  const formatTimeWithFrame = useCallback(
    (timeSeconds?: number, frameOverride?: number) => {
      if (!Number.isFinite(timeSeconds) || timeSeconds === undefined) {
        return "--";
      }
      const base = formatDuration(timeSeconds);
      const frame = frameOverride ?? resolveFrameIndex(timeSeconds);
      if (frame === undefined) {
        return base;
      }
      return `${base} + f${frame}`;
    },
    [resolveFrameIndex]
  );

  const trimLengthFrames = useMemo(() => {
    if (!trimHasRange) {
      return undefined;
    }
    if (
      typeof trimSelection?.start !== "number" ||
      typeof trimSelection?.end !== "number"
    ) {
      return undefined;
    }
    if (trimSelection.end <= trimSelection.start) {
      return 0;
    }
    const startFrame = resolveFrameIndex(trimSelection.start);
    const endFrame = resolveFrameIndex(trimSelection.end);
    if (startFrame === undefined || endFrame === undefined) {
      return undefined;
    }
    return Math.max(0, endFrame - startFrame);
  }, [resolveFrameIndex, trimHasRange, trimSelection?.end, trimSelection?.start]);

  const trimTrack = useMemo(() => {
    if (typeof resolvedDuration !== "number") {
      return undefined;
    }
    const durationSeconds = resolvedDuration;
    const start =
      typeof trimSelection?.start === "number"
        ? clampTime(trimSelection.start, durationSeconds)
        : undefined;
    const end =
      typeof trimSelection?.end === "number"
        ? clampTime(trimSelection.end, durationSeconds)
        : undefined;
    const highlight = trimEnabled ? TRIM_HIGHLIGHT_ACTIVE : TRIM_HIGHLIGHT_IDLE;
    if (start !== undefined && end !== undefined && end > start) {
      const startPct = (start / durationSeconds) * 100;
      const endPct = (end / durationSeconds) * 100;
      return buildTrimGradient(startPct, endPct, highlight);
    }
    const marker = start ?? end;
    if (marker === undefined) {
      return undefined;
    }
    const markerPct = (marker / durationSeconds) * 100;
    const markerWidth = 0.45;
    const minPct = Math.max(0, markerPct - markerWidth);
    const maxPct = Math.min(100, markerPct + markerWidth);
    return buildTrimGradient(minPct, maxPct, highlight);
  }, [resolvedDuration, trimEnabled, trimSelection?.end, trimSelection?.start]);

  const trimClearDisabled =
    controlsDisabled ||
    (trimSelection?.start === undefined && trimSelection?.end === undefined);
  const trimToggleDisabled = !trimHasRange || controlsDisabled;

  // Memoize label strings so the toolbar does not rebuild them on each tick.
  const trimInfoLines = useMemo(
    () =>
      buildTrimInfoLines({
        hasTrim: !!trim,
        selection: trimSelection,
        trimHasRange,
        trimLengthFrames,
        formatTimeWithFrame
      }),
    [
      formatTimeWithFrame,
      trim,
      trimHasRange,
      trimLengthFrames,
      trimSelection?.end,
      trimSelection?.lengthSeconds,
      trimSelection?.start
    ]
  );

  // Snap to the closest frame boundary using per-frame timestamps when available.
  const snapToFrame = useCallback(
    (timeSeconds: number) => {
      const frame = resolveFrameIndex(timeSeconds);
      if (frame === undefined) {
        return timeSeconds;
      }
      const snapped = resolveTimeForFrame(frame);
      return snapped ?? timeSeconds;
    },
    [resolveFrameIndex, resolveTimeForFrame]
  );

  const nudgeTrimBoundary = useCallback(
    (boundary: "start" | "end", deltaFrames: number) => {
      if (!trim) {
        return;
      }
      const boundaryTime =
        boundary === "start" ? trim.selection.start : trim.selection.end;
      const baseTime = typeof boundaryTime === "number" ? boundaryTime : currentTime;
      const baseFrame = resolveFrameIndex(baseTime) ?? 0;
      const nextFrame = clampFrameIndex(baseFrame + deltaFrames);
      const nextTime = resolveTimeForFrame(nextFrame);
      if (nextTime === undefined) {
        return;
      }
      if (boundary === "start") {
        trim.markIn(nextTime);
      } else {
        trim.markOut(nextTime);
      }
    },
    [clampFrameIndex, currentTime, resolveFrameIndex, resolveTimeForFrame, trim]
  );

  // Single "Mark" button: set start/end or adjust the nearest edge.
  const handleMark = useCallback(() => {
    if (!trim) {
      return;
    }
    const markTime = snapToFrame(currentTime);
    const start = trim.selection.start;
    const end = trim.selection.end;
    const hasStart = typeof start === "number";
    const hasEnd = typeof end === "number";

    if (!hasStart && !hasEnd) {
      trim.markIn(markTime);
      lastMarkEdgeRef.current = "start";
      return;
    }
    if (hasStart && !hasEnd) {
      const startTime = start as number;
      if (markTime < startTime) {
        trim.markOut(startTime);
        trim.markIn(markTime);
        lastMarkEdgeRef.current = "start";
        return;
      }
      trim.markOut(markTime);
      lastMarkEdgeRef.current = "end";
      return;
    }
    if (!hasStart && hasEnd) {
      const endTime = end as number;
      if (markTime > endTime) {
        trim.markIn(endTime);
        trim.markOut(markTime);
        lastMarkEdgeRef.current = "end";
        return;
      }
      trim.markIn(markTime);
      lastMarkEdgeRef.current = "start";
      return;
    }

    const startTime = start as number;
    const endTime = end as number;
    if (markTime < startTime) {
      trim.markIn(markTime);
      lastMarkEdgeRef.current = "start";
      return;
    }
    if (markTime > endTime) {
      trim.markOut(markTime);
      lastMarkEdgeRef.current = "end";
      return;
    }

    const distToStart = Math.abs(markTime - startTime);
    const distToEnd = Math.abs(markTime - endTime);
    if (distToStart < distToEnd) {
      trim.markIn(markTime);
      lastMarkEdgeRef.current = "start";
      return;
    }
    if (distToEnd < distToStart) {
      trim.markOut(markTime);
      lastMarkEdgeRef.current = "end";
      return;
    }

    if (lastMarkEdgeRef.current === "start") {
      trim.markOut(markTime);
      lastMarkEdgeRef.current = "end";
      return;
    }
    trim.markIn(markTime);
    lastMarkEdgeRef.current = "start";
  }, [currentTime, snapToFrame, trim]);

  const handleClearSelection = useCallback(() => {
    trim?.clear();
  }, [trim]);

  const handleToggleSelection = useCallback(() => {
    trim?.toggleEnabled();
  }, [trim]);

  return {
    trimSelection,
    trimHasRange,
    trimEnabled,
    showPassthroughTrimWarning,
    trimTrack,
    trimInfoLines,
    trimClearDisabled,
    trimToggleDisabled,
    handleMark,
    handleClearSelection,
    handleToggleSelection,
    nudgeTrimBoundary
  };
};

export default useTrimScrub;
