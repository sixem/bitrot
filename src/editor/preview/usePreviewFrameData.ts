// Derives frame map math + VFR messaging for the preview controls.
import { useCallback, useMemo } from "react";
import type { FrameMap } from "@/analysis/frameMap";
import {
  findNearestFrameIndex,
  getMinFrameStep,
  getVfrWarningMessage,
  MIN_REVERSE_STEP_INTERVAL_MS
} from "@/editor/preview/utils";

type PreviewFrameDataArgs = {
  duration?: number;
  fallbackDuration?: number;
  fps?: number;
  isVfr: boolean;
  frameMap?: FrameMap;
  frameMapStatus: "idle" | "loading" | "ready" | "error";
  frameMapError?: string;
  onRequestFrameMap?: () => void;
};

// Derive frame/time helpers and VFR messaging from the available preview metadata.
const usePreviewFrameData = ({
  duration,
  fallbackDuration,
  fps,
  isVfr,
  frameMap,
  frameMapStatus,
  frameMapError,
  onRequestFrameMap
}: PreviewFrameDataArgs) => {
  const resolvedDuration = Number.isFinite(duration)
    ? duration
    : Number.isFinite(fallbackDuration)
      ? fallbackDuration
      : undefined;
  const nominalFps =
    typeof fps === "number" && Number.isFinite(fps) && fps > 0 ? fps : undefined;
  const resolvedFps = !isVfr ? nominalFps : undefined;
  const frameDurationSeconds = resolvedFps ? 1 / resolvedFps : undefined;
  const frameMapFrames = frameMap?.times ?? null;
  const hasFrameMap = !!frameMapFrames && frameMapFrames.length > 0;
  const canRequestFrameMap = isVfr && !hasFrameMap && !!onRequestFrameMap;
  const frameMapErrorLabel = frameMapError?.split("\n")[0]?.trim();
  const frameMapStep = useMemo(() => getMinFrameStep(frameMapFrames), [frameMapFrames]);
  const derivedDuration =
    typeof resolvedDuration === "number" && Number.isFinite(resolvedDuration)
      ? resolvedDuration
      : frameMapFrames && frameMapFrames.length > 0
        ? frameMapFrames[frameMapFrames.length - 1]
        : undefined;
  const derivedFps =
    resolvedFps ??
    (frameMapFrames && derivedDuration && derivedDuration > 0
      ? frameMapFrames.length / derivedDuration
      : undefined);
  const reverseStepIntervalMs = useMemo(() => {
    if (typeof derivedFps !== "number" || !Number.isFinite(derivedFps) || derivedFps <= 0) {
      return 1000;
    }
    return Math.max(MIN_REVERSE_STEP_INTERVAL_MS, 1000 / derivedFps);
  }, [derivedFps]);
  const vfrWarningMessage = useMemo(
    () => getVfrWarningMessage(isVfr, hasFrameMap, frameMapStatus, frameMapErrorLabel),
    [frameMapErrorLabel, frameMapStatus, hasFrameMap, isVfr]
  );
  const showVfrWarning = Boolean(vfrWarningMessage);
  const showFrameMapAction =
    canRequestFrameMap &&
    (frameMapStatus === "idle" || frameMapStatus === "error");
  const frameMapActionLabel =
    frameMapStatus === "error" ? "Retry frame map" : "Load frame map";
  const totalFrames = hasFrameMap
    ? frameMapFrames?.length
    : resolvedFps !== undefined && typeof resolvedDuration === "number"
      ? Math.max(1, Math.round(resolvedDuration * resolvedFps))
      : undefined;
  const maxFrameIndex = totalFrames ? Math.max(0, totalFrames - 1) : undefined;

  const clampFrameIndex = useCallback(
    (frame: number) => {
      if (maxFrameIndex === undefined) {
        return Math.max(0, frame);
      }
      return Math.min(Math.max(0, frame), maxFrameIndex);
    },
    [maxFrameIndex]
  );

  const resolveFrameIndex = useCallback(
    (timeSeconds: number) => {
      if (!Number.isFinite(timeSeconds)) {
        return undefined;
      }
      if (frameMapFrames && frameMapFrames.length > 0) {
        return findNearestFrameIndex(frameMapFrames, timeSeconds);
      }
      if (!resolvedFps) {
        return undefined;
      }
      return Math.max(0, Math.round(timeSeconds * resolvedFps));
    },
    [frameMapFrames, resolvedFps]
  );

  const resolveTimeForFrame = useCallback(
    (frame: number) => {
      if (!Number.isFinite(frame)) {
        return undefined;
      }
      if (frameMapFrames && frameMapFrames.length > 0) {
        const clamped = clampFrameIndex(frame);
        return frameMapFrames[clamped];
      }
      if (!frameDurationSeconds) {
        return undefined;
      }
      return Math.max(0, frame) * frameDurationSeconds;
    },
    [clampFrameIndex, frameDurationSeconds, frameMapFrames]
  );

  return {
    resolvedDuration,
    resolvedFps,
    frameDurationSeconds,
    frameMapFrames,
    hasFrameMap,
    canRequestFrameMap,
    frameMapStep,
    derivedFps,
    reverseStepIntervalMs,
    frameMapErrorLabel,
    vfrWarningMessage,
    showVfrWarning,
    showFrameMapAction,
    frameMapActionLabel,
    totalFrames,
    maxFrameIndex,
    clampFrameIndex,
    resolveFrameIndex,
    resolveTimeForFrame
  };
};

export default usePreviewFrameData;
