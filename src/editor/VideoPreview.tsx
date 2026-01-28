import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { VideoAsset } from "@/domain/video";
import type { FrameEntry, FrameMap } from "@/analysis/frameMap";
import { convertFileSrc } from "@tauri-apps/api/core";
import formatDuration from "@/utils/formatDuration";
import type { FramePreviewControl } from "@/editor/useFramePreview";
import type { TrimSelectionState } from "@/editor/useTrimSelection";

type VideoPreviewProps = {
  asset: VideoAsset;
  fallbackDuration?: number;
  fps?: number;
  isVfr?: boolean;
  isCopyMode?: boolean;
  frameMap?: FrameMap;
  frameMapStatus?: "idle" | "loading" | "ready" | "error";
  frameMapError?: string;
  preview?: FramePreviewControl;
  renderTimeSeconds?: number;
  trim?: TrimControl;
};

type TrimControl = {
  selection: TrimSelectionState;
  markIn: (timeSeconds: number) => void;
  markOut: (timeSeconds: number) => void;
  clear: () => void;
  toggleEnabled: () => void;
};

// Ignore keyboard shortcuts when the user is typing or adjusting form fields.
const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

// Strip quotes that sometimes wrap drag-drop paths.
const sanitizePath = (path: string) => path.trim().replace(/^"+|"+$/g, "");

const clampTime = (time: number, duration?: number) => {
  if (!Number.isFinite(time)) {
    return 0;
  }
  if (!Number.isFinite(duration)) {
    return Math.max(0, time);
  }
  return Math.min(Math.max(time, 0), Math.max(0, duration ?? 0));
};

const MIN_SCRUB_STEP_SECONDS = 0.001;
const TRIM_TRACK_BASE_COLOR = "#131313";

const findNearestFrameIndex = (frames: FrameEntry[], timeSeconds: number) => {
  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = frames[mid].timeSeconds;
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

  const before = frames[low - 1].timeSeconds;
  const after = frames[low].timeSeconds;
  return timeSeconds - before <= after - timeSeconds ? low - 1 : low;
};

// Pick the smallest positive frame delta to keep scrubbing granular for VFR clips.
const getMinFrameStep = (frames: FrameEntry[] | null) => {
  if (!frames || frames.length < 2) {
    return undefined;
  }

  let minDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < frames.length; index += 1) {
    const delta = frames[index].timeSeconds - frames[index - 1].timeSeconds;
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
const buildTrimGradient = (startPct: number, endPct: number, highlight: string) => {
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

const getVfrWarningMessage = (
  isVfr: boolean,
  hasFrameMap: boolean,
  status: "idle" | "loading" | "ready" | "error",
  errorLabel?: string
) => {
  if (!isVfr || hasFrameMap) {
    return null;
  }
  if (status === "loading" || status === "idle") {
    return "Variable FPS detected. Loading a frame map for accurate controls...";
  }
  if (status === "error") {
    return errorLabel
      ? `Variable FPS detected. Frame map failed: ${errorLabel}`
      : "Variable FPS detected. Frame map failed to load.";
  }
  return "Variable FPS detected. Frame-accurate controls are disabled.";
};

// Video preview player with custom scrub + skip controls.
const VideoPreview = ({
  asset,
  fallbackDuration,
  fps,
  isVfr = false,
  isCopyMode = false,
  frameMap,
  frameMapStatus = "idle",
  frameMapError,
  preview,
  renderTimeSeconds,
  trim
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.2);
  const [skipSeconds, setSkipSeconds] = useState(5);

  const sourcePath = sanitizePath(asset.path);
  const sourceUrl = useMemo(
    () => (sourcePath.length > 0 ? convertFileSrc(sourcePath) : ""),
    [sourcePath]
  );

  const resolvedDuration = Number.isFinite(duration)
    ? duration
    : Number.isFinite(fallbackDuration)
      ? fallbackDuration
      : undefined;
  const nominalFps =
    typeof fps === "number" && Number.isFinite(fps) && fps > 0 ? fps : undefined;
  const resolvedFps = !isVfr ? nominalFps : undefined;
  const frameDurationSeconds = resolvedFps ? 1 / resolvedFps : undefined;
  const frameMapFrames = frameMap?.frames ?? null;
  const hasFrameMap = !!frameMapFrames && frameMapFrames.length > 0;
  const frameMapErrorLabel = frameMapError?.split("\n")[0]?.trim();
  const frameMapStep = useMemo(() => getMinFrameStep(frameMapFrames), [frameMapFrames]);
  const vfrWarningMessage = useMemo(
    () => getVfrWarningMessage(isVfr, hasFrameMap, frameMapStatus, frameMapErrorLabel),
    [frameMapErrorLabel, frameMapStatus, hasFrameMap, isVfr]
  );
  const showVfrWarning = Boolean(vfrWarningMessage);

  // Reset playback state when the source changes.
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setCurrentTime(0);
    setDuration(undefined);
    setIsReady(false);
    setIsPlaying(false);
    setError(null);
  }, [sourceUrl]);

  // Keep the element in sync with the current volume value.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.volume = volume;
    video.muted = volume === 0;
  }, [volume, sourceUrl]);

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

  const handleTogglePlayback = async () => {
    const video = videoRef.current;
    if (!video || !sourceUrl || error) {
      return;
    }
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setError("Playback blocked. Click play again.");
      }
      return;
    }
    video.pause();
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
    }
    setIsReady(true);
    setError(null);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setCurrentTime(video.currentTime);
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleError = () => {
    setError("Unable to load preview.");
    setIsReady(false);
  };

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

  const scrubValue = Number.isFinite(resolvedDuration)
    ? clampTime(currentTime, resolvedDuration)
    : 0;
  const totalFrames = hasFrameMap
    ? frameMapFrames?.length
    : resolvedFps && Number.isFinite(resolvedDuration)
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
        return frameMapFrames[clamped]?.timeSeconds;
      }
      if (!frameDurationSeconds) {
        return undefined;
      }
      return Math.max(0, frame) * frameDurationSeconds;
    },
    [clampFrameIndex, frameDurationSeconds, frameMapFrames]
  );
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
  const trimSelection = trim?.selection;
  const trimHasRange =
    !!trimSelection?.isValid &&
    typeof trimSelection.start === "number" &&
    typeof trimSelection.end === "number";
  const trimEnabled = !!trimSelection?.enabled && trimHasRange;
  const showCopyTrimWarning = isCopyMode && trimEnabled;
  const trimLengthSeconds = trimSelection?.lengthSeconds;
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
  // Show frame-accurate time readouts when FPS or a frame map is known.
  const formatTimeWithFrame = (timeSeconds?: number, frameOverride?: number) => {
    if (!Number.isFinite(timeSeconds) || timeSeconds === undefined) {
      return "--";
    }
    const base = formatDuration(timeSeconds);
    const frame = frameOverride ?? resolveFrameIndex(timeSeconds);
    if (frame === undefined) {
      return base;
    }
    return `${base} + f${frame}`;
  };
  const trimTrack = useMemo(() => {
    if (!resolvedDuration) {
      return undefined;
    }
    const start =
      typeof trimSelection?.start === "number"
        ? clampTime(trimSelection.start, resolvedDuration)
        : undefined;
    const end =
      typeof trimSelection?.end === "number"
        ? clampTime(trimSelection.end, resolvedDuration)
        : undefined;
    const highlight = trimEnabled
      ? "rgba(123, 255, 168, 0.45)"
      : "rgba(120, 220, 255, 0.25)";
    if (start !== undefined && end !== undefined && end > start) {
      const startPct = (start / resolvedDuration) * 100;
      const endPct = (end / resolvedDuration) * 100;
      return buildTrimGradient(startPct, endPct, highlight);
    }
    const marker = start ?? end;
    if (marker === undefined) {
      return undefined;
    }
    const markerPct = (marker / resolvedDuration) * 100;
    const markerWidth = 0.45;
    const minPct = Math.max(0, markerPct - markerWidth);
    const maxPct = Math.min(100, markerPct + markerWidth);
    return buildTrimGradient(minPct, maxPct, highlight);
  }, [resolvedDuration, trimEnabled, trimSelection?.end, trimSelection?.start]);

  const handlePreviewToggle = () => {
    if (!preview || previewDisabled) {
      return;
    }
    if (preview.isActive && !preview.isProcessing) {
      preview.onClear();
      return;
    }
    preview.onRequest(currentTime);
  };

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

  const nudgeTrimBoundary = useCallback(
    (boundary: "start" | "end", deltaFrames: number) => {
      if (!trim) {
        return;
      }
      const boundaryTime =
        boundary === "start" ? trim.selection.start : trim.selection.end;
      const video = videoRef.current;
      const baseTime =
        typeof boundaryTime === "number"
          ? boundaryTime
          : typeof video?.currentTime === "number"
            ? video.currentTime
            : undefined;
      if (typeof baseTime !== "number") {
        return;
      }
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
    [clampFrameIndex, resolveFrameIndex, resolveTimeForFrame, trim]
  );

  // Frame-accurate keyboard nudges for the playhead and trim markers.
  useEffect(() => {
    const canNudgeFrames = hasFrameMap || !!frameDurationSeconds;
    if (!canNudgeFrames) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || controlsDisabled || !sourceUrl) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      const delta = event.key === "ArrowRight" ? 1 : -1;
      if (event.shiftKey && trim) {
        event.preventDefault();
        nudgeTrimBoundary("start", delta);
        return;
      }
      if (event.altKey && trim) {
        event.preventDefault();
        nudgeTrimBoundary("end", delta);
        return;
      }

      event.preventDefault();
      seekByFrames(delta);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    frameDurationSeconds,
    hasFrameMap,
    controlsDisabled,
    nudgeTrimBoundary,
    seekByFrames,
    sourceUrl,
    trim
  ]);

  // Inline SVG icons keep toolbar buttons self-contained and theme-colored.
  const bookmarkIcon = (
    <svg
      className="preview-button-icon"
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M410.9,0H85.1C72.3,0,61.8,10.4,61.8,23.3V512L248,325.8L434.2,512V23.3C434.2,10.4,423.8,0,410.9,0z"
      />
    </svg>
  );
  const clearIcon = (
    <svg
      className="preview-button-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 8L6 2H16V14H6L0 8ZM6.79289 6.20711L8.58579 8L6.79289 9.79289L8.20711 11.2071L10 9.41421L11.7929 11.2071L13.2071 9.79289L11.4142 8L13.2071 6.20711L11.7929 4.79289L10 6.58579L8.20711 4.79289L6.79289 6.20711Z"
        fill="currentColor"
      />
    </svg>
  );

  return (
    <div className="preview-player" data-ready={isReady}>
      <div className="preview-surface">
        {showPreviewFrame && preview?.previewUrl && (
          <img
            className="preview-frame"
            src={preview.previewUrl}
            alt="Preview frame"
          />
        )}
        {sourceUrl ? (
          <video
            ref={videoRef}
            className="preview-video"
            src={sourceUrl}
            preload="metadata"
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handlePause}
            onError={handleError}
          />
        ) : (
          <div className="preview-placeholder">No source loaded.</div>
        )}
        {!error && sourceUrl && !isReady && (
          <div className="preview-overlay">Preparing preview...</div>
        )}
        {error && <div className="preview-overlay preview-overlay--error">{error}</div>}
        {showPreviewStatus && preview?.error && (
          <div className="preview-overlay preview-overlay--error">{preview.error}</div>
        )}
        {showPreviewStatus && preview?.isLoading && (
          <div className="preview-overlay">Rendering preview frame...</div>
        )}
        {showPreviewStatus && preview?.isProcessing && !preview.previewUrl && (
          <div className="preview-overlay">Waiting for preview...</div>
        )}
        {showPreviewToggle && preview && (
          <div className="preview-corner">
            <button
              className="preview-toggle"
              type="button"
              onClick={handlePreviewToggle}
              data-active={isPreviewActive}
              disabled={previewDisabled}
            >
              {previewLabel}
            </button>
          </div>
        )}
      </div>

      <div className="preview-toolbar">
        <div className="preview-toolbar-top">
          <div className="preview-controls">
            <button
              className="preview-button preview-button--toggle"
              type="button"
              onClick={handleTogglePlayback}
              disabled={!sourceUrl || controlsDisabled}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              className="preview-button"
              type="button"
              onClick={() => stepBy(-skipSeconds)}
              onContextMenu={handleSkipContextMenu}
              disabled={!resolvedDuration || controlsDisabled}
            >
              -{skipSeconds}s
            </button>
            <button
              className="preview-button"
              type="button"
              onClick={() => stepBy(skipSeconds)}
              onContextMenu={handleSkipContextMenu}
              disabled={!resolvedDuration || controlsDisabled}
            >
              +{skipSeconds}s
            </button>
          </div>
          {trim && (
            <div className="preview-toolbar-actions">
              <button
                className="preview-button preview-button--icon"
                type="button"
                onClick={() => trim.markIn(snapToFrame(currentTime))}
                disabled={!resolvedDuration || controlsDisabled}
              >
                {bookmarkIcon}
                <span>In</span>
              </button>
              <button
                className="preview-button preview-button--icon"
                type="button"
                onClick={() => trim.markOut(snapToFrame(currentTime))}
                disabled={!resolvedDuration || controlsDisabled}
              >
                {bookmarkIcon}
                <span>Out</span>
              </button>
              <button
                className="preview-button preview-button--ghost"
                type="button"
                onClick={trim.toggleEnabled}
                data-active={trimEnabled}
                disabled={!trimHasRange || controlsDisabled}
              >
                Use selection
              </button>
              <button
                className="preview-button preview-button--ghost preview-button--icon"
                type="button"
                onClick={trim.clear}
                aria-label="Clear selection"
                disabled={
                  controlsDisabled ||
                  (trimSelection?.start === undefined &&
                    trimSelection?.end === undefined)
                }
              >
                {clearIcon}
              </button>
            </div>
          )}
          <div className="preview-time">
            <span>{formatDuration(currentTime)}</span>
            <span>/</span>
            <span>{formatDuration(resolvedDuration)}</span>
            {clampedFrame !== undefined && totalFrames !== undefined && (
              <>
                <span className="preview-time-separator">|</span>
                <span>Frame {clampedFrame}</span>
                <span>/</span>
                <span>{totalFrames}</span>
              </>
            )}
          </div>
        </div>
        {showVfrWarning && (
          <div className="preview-warning">{vfrWarningMessage}</div>
        )}
        {showCopyTrimWarning && (
          <div className="preview-warning">
            Copy mode trim requires re-encoding for frame-accurate cuts.
          </div>
        )}
        {trim && (
          <div className="preview-range" data-active={trimEnabled}>
            <div className="preview-range-info">
              {trimHasRange ? (
                <>
                  <span>In {formatTimeWithFrame(trimSelection?.start)}</span>
                  <span>Out {formatTimeWithFrame(trimSelection?.end)}</span>
                  <span>Len {formatTimeWithFrame(trimLengthSeconds, trimLengthFrames)}</span>
                </>
              ) : trimSelection?.start !== undefined ? (
                <>
                  <span>Start {formatTimeWithFrame(trimSelection.start)}</span>
                  <span>Awaiting end</span>
                </>
              ) : trimSelection?.end !== undefined ? (
                <>
                  <span>End {formatTimeWithFrame(trimSelection.end)}</span>
                  <span>Awaiting start</span>
                </>
              ) : (
                <span>No selection</span>
              )}
            </div>
            <div className="preview-audio">
              <span className="preview-audio-label">Volume</span>
              <input
                className="preview-volume"
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumePercent}
                onChange={(event) => setVolume(Number(event.target.value) / 100)}
                disabled={!sourceUrl || controlsDisabled}
                aria-label="Preview volume"
              />
              <span className="preview-audio-value">{volumePercent}%</span>
            </div>
          </div>
        )}
      </div>

      <input
        className="preview-scrub"
        type="range"
        min={0}
        max={resolvedDuration ?? 0}
        step={frameMapStep ?? frameDurationSeconds ?? 0.01}
        value={scrubValue}
        onChange={(event) => seekTo(Number(event.target.value))}
        disabled={!resolvedDuration || controlsDisabled}
        aria-label="Scrub preview"
        style={
          trimTrack
            ? ({ "--scrub-track": trimTrack } as CSSProperties)
            : undefined
        }
      />
    </div>
  );
};

export default VideoPreview;




