// Editor preview player with timeline, trim, and frame controls.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { VideoAsset } from "@/domain/video";
import type { FrameMap } from "@/analysis/frameMap";
import { convertFileSrc } from "@tauri-apps/api/core";
import formatDuration from "@/utils/formatDuration";
import { clampTime } from "@/utils/time";
import type { FramePreviewControl } from "@/editor/useFramePreview";
import { sanitizePath } from "@/system/path";
import type { TrimControl } from "@/editor/preview/types";
import { capturePreviewFrame } from "@/editor/preview/capturePreviewFrame";
import usePreviewVideoState from "@/editor/preview/usePreviewVideoState";
import usePreviewFrameData from "@/editor/preview/usePreviewFrameData";
import useTrimScrub from "@/editor/preview/useTrimScrub";
import useArrowHoldPlayback from "@/editor/preview/useArrowHoldPlayback";
import usePreviewKeyboard from "@/editor/preview/usePreviewKeyboard";
import { formatDurationSafe } from "@/editor/preview/utils";
import PreviewSurface from "@/editor/preview/PreviewSurface";
import PreviewToolbar from "@/editor/preview/PreviewToolbar";
import PreviewRange from "@/editor/preview/PreviewRange";
import PreviewScrubber from "@/editor/preview/PreviewScrubber";

type VideoPreviewProps = {
  asset: VideoAsset;
  fallbackDuration?: number;
  fps?: number;
  isVfr?: boolean;
  isPassthroughMode?: boolean;
  frameMap?: FrameMap;
  frameMapStatus?: "idle" | "loading" | "ready" | "error";
  frameMapError?: string;
  onRequestFrameMap?: () => void;
  preview?: FramePreviewControl;
  renderTimeSeconds?: number;
  trim?: TrimControl;
};

// Video preview player with custom scrub + skip controls.
const VideoPreview = ({
  asset,
  fallbackDuration,
  fps,
  isVfr = false,
  isPassthroughMode = false,
  frameMap,
  frameMapStatus = "idle",
  frameMapError,
  onRequestFrameMap,
  preview,
  renderTimeSeconds,
  trim
}: VideoPreviewProps) => {
  // Track arrow-key hold state for tap-vs-hold behavior.
  const holdActiveRef = useRef(false);
  const holdKeyRef = useRef<"ArrowLeft" | "ArrowRight" | null>(null);
  const [skipSeconds, setSkipSeconds] = useState(5);

  // Strip quotes that sometimes wrap drag-drop paths.
  const sourcePath = sanitizePath(asset.path);
  const sourceUrl = useMemo(
    () => (sourcePath.length > 0 ? convertFileSrc(sourcePath) : ""),
    [sourcePath]
  );

  // Centralize the <video> element state and event handlers.
  const {
    videoRef,
    currentTime,
    setCurrentTime,
    duration,
    isReady,
    isPlaying,
    setIsPlaying,
    error,
    volume,
    setVolume,
    resetState,
    handleTogglePlayback,
    handleLoadedMetadata,
    handleTimeUpdate,
    handlePlay,
    handlePause,
    handleError
  } = usePreviewVideoState({
    sourceUrl,
    holdActiveRef,
    initialVolume: 0.2
  });

  const {
    resolvedDuration,
    frameDurationSeconds,
    hasFrameMap,
    canRequestFrameMap,
    frameMapStep,
    reverseStepIntervalMs,
    vfrWarningMessage,
    showVfrWarning,
    showFrameMapAction,
    frameMapActionLabel,
    totalFrames,
    maxFrameIndex,
    clampFrameIndex,
    resolveFrameIndex,
    resolveTimeForFrame
  } = usePreviewFrameData({
    duration,
    fallbackDuration,
    fps,
    isVfr,
    frameMap,
    frameMapStatus,
    frameMapError,
    onRequestFrameMap
  });

  // Move the playhead while keeping it inside the available duration.
  const seekTo = useCallback(
    (nextTime: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      if (preview?.isActive && !preview.isProcessing) {
        preview.onClear();
      }
      const clamped = clampTime(nextTime, resolvedDuration);
      video.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [preview, resolvedDuration]
  );

  const stepBy = (delta: number) => {
    seekTo(currentTime + delta);
  };

  const cycleSkipSeconds = useCallback(() => {
    setSkipSeconds((value) => (value >= 5 ? 1 : value + 1));
  }, []);

  const handleSkipContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      cycleSkipSeconds();
    },
    [cycleSkipSeconds]
  );

  // Keep the scrubber in sync with render progress when previewing a job.
  useEffect(() => {
    if (!preview?.isProcessing) {
      return;
    }
    if (typeof renderTimeSeconds !== "number" || !Number.isFinite(renderTimeSeconds)) {
      return;
    }
    const clamped = clampTime(renderTimeSeconds, resolvedDuration);
    setCurrentTime(clamped);
  }, [preview?.isProcessing, renderTimeSeconds, resolvedDuration]);

  const scrubValue = typeof resolvedDuration === "number"
    ? clampTime(currentTime, resolvedDuration)
    : 0;
  const currentFrame = resolveFrameIndex(scrubValue);
  const clampedFrame =
    currentFrame !== undefined && maxFrameIndex !== undefined
      ? Math.min(currentFrame, maxFrameIndex)
      : currentFrame;
  const volumePercent = Math.round(volume * 100);
  const isPreviewEnabled = !!preview?.isEnabled;
  const showPreviewToggle = isPreviewEnabled && !isPlaying && isReady && !error;
  const isPreviewActive = !!preview?.isActive;
  const showPreviewFrame = isPreviewActive && (!isPlaying || !!preview?.isProcessing);
  const previewLabel = preview?.label ?? "Preview frame";
  const previewDisabled = !!preview?.isProcessing || !!preview?.isLoading;
  const controlsDisabled = !!preview?.isProcessing || !!error;
  const showPreviewStatus = isPreviewEnabled && (!isPlaying || !!preview?.isProcessing);
  const {
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
  } = useTrimScrub({
    trim,
    currentTime,
    resolvedDuration,
    isPassthroughMode,
    controlsDisabled,
    resolveFrameIndex,
    resolveTimeForFrame,
    clampFrameIndex
  });
  // Precompute toolbar + trim labels so the render stays focused on layout.
  const frameInfo =
    clampedFrame !== undefined && totalFrames !== undefined
      ? { current: clampedFrame, total: totalFrames }
      : undefined;
  const timeCurrentLabel = formatDuration(currentTime);
  const timeTotalLabel = formatDurationSafe(resolvedDuration);
  const playDisabled = !sourceUrl || controlsDisabled;
  const volumeDisabled = !sourceUrl || controlsDisabled;

  const handlePreviewToggle = () => {
    if (!preview || previewDisabled) {
      return;
    }
    if (preview.isActive && !preview.isProcessing) {
      preview.onClear();
      return;
    }
    const video = videoRef.current;
    const frame = video
      ? capturePreviewFrame(video)
      : Promise.reject(new Error("Preview video is not ready."));
    preview.onRequest({ timeSeconds: currentTime, frame });
  };

  const handleRequestFrameMap = useCallback(() => {
    if (!onRequestFrameMap) {
      return;
    }
    onRequestFrameMap();
  }, [onRequestFrameMap]);

  const seekByFrames = useCallback(
    (deltaFrames: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      const baseFrame = resolveFrameIndex(video.currentTime) ?? 0;
      const nextFrame = clampFrameIndex(baseFrame + deltaFrames);
      const nextTime = resolveTimeForFrame(nextFrame);
      if (nextTime === undefined) {
        return;
      }
      seekTo(nextTime);
    },
    [clampFrameIndex, resolveFrameIndex, resolveTimeForFrame, seekTo]
  );

  const { startHoldPlayback, stopHoldPlayback } = useArrowHoldPlayback({
    videoRef,
    holdActiveRef,
    holdKeyRef,
    controlsDisabled,
    sourceUrl,
    hasFrameMap,
    frameDurationSeconds,
    reverseStepIntervalMs,
    canRequestFrameMap,
    onRequestFrameMap: handleRequestFrameMap,
    seekByFrames,
    setCurrentTime,
    setIsPlaying
  });

  // Reset playback state when the source changes.
  useEffect(() => {
    stopHoldPlayback();
    resetState();
  }, [resetState, sourceUrl, stopHoldPlayback]);

  usePreviewKeyboard({
    controlsDisabled,
    sourceUrl,
    hasFrameMap,
    frameDurationSeconds,
    canRequestFrameMap,
    trim,
    nudgeTrimBoundary,
    seekByFrames,
    startHoldPlayback,
    stopHoldPlayback,
    holdActiveRef,
    holdKeyRef,
    onRequestFrameMap: handleRequestFrameMap
  });

  return (
    <div className="preview-player" data-ready={isReady}>
      <PreviewSurface
        sourceUrl={sourceUrl}
        isReady={isReady}
        error={error}
        preview={preview}
        showPreviewFrame={showPreviewFrame}
        showPreviewStatus={showPreviewStatus}
        showPreviewToggle={showPreviewToggle}
        isPreviewActive={isPreviewActive}
        previewLabel={previewLabel}
        previewDisabled={previewDisabled}
        onTogglePreview={handlePreviewToggle}
        videoRef={videoRef}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onError={handleError}
      />
      <PreviewToolbar
        isPlaying={isPlaying}
        playDisabled={playDisabled}
        controlsDisabled={controlsDisabled}
        resolvedDuration={resolvedDuration}
        skipSeconds={skipSeconds}
        onTogglePlayback={handleTogglePlayback}
        onStepBy={stepBy}
        onSkipContextMenu={handleSkipContextMenu}
        showTrimActions={!!trim}
        onMark={handleMark}
        onClearSelection={handleClearSelection}
        onToggleTrim={handleToggleSelection}
        trimEnabled={trimEnabled}
        trimClearDisabled={trimClearDisabled}
        trimToggleDisabled={trimToggleDisabled}
        timeCurrentLabel={timeCurrentLabel}
        timeTotalLabel={timeTotalLabel}
        frameInfo={frameInfo}
        vfrWarningMessage={showVfrWarning ? vfrWarningMessage : null}
        showFrameMapAction={showFrameMapAction}
        frameMapActionLabel={frameMapActionLabel}
        onRequestFrameMap={handleRequestFrameMap}
        showPassthroughTrimWarning={showPassthroughTrimWarning}
        range={
          trim ? (
            <PreviewRange
              isActive={trimEnabled}
              infoLines={trimInfoLines}
              volumePercent={volumePercent}
              onVolumeChange={setVolume}
              isDisabled={volumeDisabled}
            />
          ) : null
        }
      />
      <PreviewScrubber
        value={scrubValue}
        max={resolvedDuration ?? 0}
        step={frameMapStep ?? frameDurationSeconds ?? 0.01}
        isDisabled={!resolvedDuration || controlsDisabled}
        trimTrack={trimTrack}
        onChange={seekTo}
      />
    </div>
  );
};

export default VideoPreview;

