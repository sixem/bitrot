import type { RefObject } from "react";
import type { FramePreviewControl } from "@/editor/useFramePreview";

// Renders the video element, preview frame, and related overlays.
type PreviewSurfaceProps = {
  sourceUrl: string;
  isReady: boolean;
  error: string | null;
  preview?: FramePreviewControl;
  showPreviewFrame: boolean;
  showPreviewStatus: boolean;
  showPreviewToggle: boolean;
  isPreviewActive: boolean;
  previewLabel: string;
  previewDisabled: boolean;
  onTogglePreview: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onError: () => void;
};

const PreviewSurface = ({
  sourceUrl,
  isReady,
  error,
  preview,
  showPreviewFrame,
  showPreviewStatus,
  showPreviewToggle,
  isPreviewActive,
  previewLabel,
  previewDisabled,
  onTogglePreview,
  videoRef,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onError
}: PreviewSurfaceProps) => (
  <div className="preview-surface">
    {showPreviewFrame && preview?.previewUrl && (
      <img className="preview-frame" src={preview.previewUrl} alt="Preview frame" />
    )}
    {sourceUrl ? (
      <video
        ref={videoRef}
        className="preview-video"
        src={sourceUrl}
        preload="metadata"
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onPause}
        onError={onError}
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
          onClick={onTogglePreview}
          data-active={isPreviewActive}
          disabled={previewDisabled}
        >
          {previewLabel}
        </button>
      </div>
    )}
  </div>
);

export default PreviewSurface;
