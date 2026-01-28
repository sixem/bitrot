import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import { convertFileSrc } from "@tauri-apps/api/core";
import formatDuration from "@/utils/formatDuration";
import type { FramePreviewControl } from "@/editor/useFramePreview";

type VideoPreviewProps = {
  asset: VideoAsset;
  fallbackDuration?: number;
  preview?: FramePreviewControl;
  renderTimeSeconds?: number;
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

// Video preview player with custom scrub + skip controls.
const VideoPreview = ({
  asset,
  fallbackDuration,
  preview,
  renderTimeSeconds
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.2);

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
  const seekTo = (nextTime: number) => {
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
  };

  const stepBy = (delta: number) => {
    seekTo(currentTime + delta);
  };

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
  const volumePercent = Math.round(volume * 100);
  const isPreviewEnabled = !!preview?.isEnabled;
  const showPreviewToggle = isPreviewEnabled && !isPlaying && isReady && !error;
  const isPreviewActive = !!preview?.isActive;
  const showPreviewFrame = isPreviewActive && (!isPlaying || !!preview?.isProcessing);
  const previewLabel = preview?.label ?? "Preview frame";
  const previewDisabled = !!preview?.isProcessing || !!preview?.isLoading;
  const controlsDisabled = !!preview?.isProcessing || !!error;
  const showPreviewStatus = isPreviewEnabled && (!isPlaying || !!preview?.isProcessing);

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
        <div className="preview-controls">
          <button
            className="preview-button"
            type="button"
            onClick={handleTogglePlayback}
            disabled={!sourceUrl || controlsDisabled}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="preview-button"
            type="button"
            onClick={() => stepBy(-5)}
            disabled={!resolvedDuration || controlsDisabled}
          >
            -5s
          </button>
          <button
            className="preview-button"
            type="button"
            onClick={() => stepBy(5)}
            disabled={!resolvedDuration || controlsDisabled}
          >
            +5s
          </button>
        </div>
        <div className="preview-time">
          <span>{formatDuration(currentTime)}</span>
          <span>/</span>
          <span>{formatDuration(resolvedDuration)}</span>
        </div>
      </div>

      <input
        className="preview-scrub"
        type="range"
        min={0}
        max={resolvedDuration ?? 0}
        step={0.01}
        value={scrubValue}
        onChange={(event) => seekTo(Number(event.target.value))}
        disabled={!resolvedDuration || controlsDisabled}
        aria-label="Scrub preview"
      />

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
  );
};

export default VideoPreview;
