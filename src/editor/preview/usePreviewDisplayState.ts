// Derived labels + display state for the preview toolbar and scrubber.
import { useMemo } from "react";
import formatDuration from "@/utils/formatDuration";
import { clampTime } from "@/utils/time";
import { formatDurationSafe } from "@/editor/preview/utils";

type FrameInfo = {
  current: number;
  total: number;
};

type UsePreviewDisplayStateArgs = {
  currentTime: number;
  resolvedDuration?: number;
  resolveFrameIndex: (timeSeconds: number) => number | undefined;
  maxFrameIndex?: number;
  totalFrames?: number;
  volume: number;
  sourceUrl: string;
  controlsDisabled: boolean;
};

type UsePreviewDisplayStateResult = {
  scrubValue: number;
  frameInfo?: FrameInfo;
  timeCurrentLabel: string;
  timeTotalLabel: string;
  volumePercent: number;
  playDisabled: boolean;
  volumeDisabled: boolean;
};

const usePreviewDisplayState = ({
  currentTime,
  resolvedDuration,
  resolveFrameIndex,
  maxFrameIndex,
  totalFrames,
  volume,
  sourceUrl,
  controlsDisabled
}: UsePreviewDisplayStateArgs): UsePreviewDisplayStateResult => {
  const scrubValue = useMemo(
    () =>
      typeof resolvedDuration === "number"
        ? clampTime(currentTime, resolvedDuration)
        : 0,
    [currentTime, resolvedDuration]
  );

  const frameInfo = useMemo(() => {
    if (totalFrames === undefined) {
      return undefined;
    }
    const currentFrame = resolveFrameIndex(scrubValue);
    const clampedFrame =
      currentFrame !== undefined && maxFrameIndex !== undefined
        ? Math.min(currentFrame, maxFrameIndex)
        : currentFrame;
    if (clampedFrame === undefined) {
      return undefined;
    }
    return { current: clampedFrame, total: totalFrames };
  }, [maxFrameIndex, resolveFrameIndex, scrubValue, totalFrames]);

  const timeCurrentLabel = useMemo(
    () => formatDuration(currentTime),
    [currentTime]
  );

  const timeTotalLabel = useMemo(
    () => formatDurationSafe(resolvedDuration),
    [resolvedDuration]
  );

  const volumePercent = useMemo(() => Math.round(volume * 100), [volume]);

  const playDisabled = useMemo(
    () => !sourceUrl || controlsDisabled,
    [controlsDisabled, sourceUrl]
  );

  const volumeDisabled = useMemo(
    () => !sourceUrl || controlsDisabled,
    [controlsDisabled, sourceUrl]
  );

  return {
    scrubValue,
    frameInfo,
    timeCurrentLabel,
    timeTotalLabel,
    volumePercent,
    playDisabled,
    volumeDisabled
  };
};

export default usePreviewDisplayState;
