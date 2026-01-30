import type { MouseEvent, ReactNode } from "react";
import { BookmarkIcon, ClearIcon } from "@/ui/icons";

// Toolbar for playback controls, status, and trim actions.
type FrameInfo = {
  current: number;
  total: number;
};

type PreviewToolbarProps = {
  isPlaying: boolean;
  playDisabled: boolean;
  controlsDisabled: boolean;
  resolvedDuration?: number;
  skipSeconds: number;
  onTogglePlayback: () => void;
  onStepBy: (deltaSeconds: number) => void;
  onSkipContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  showTrimActions: boolean;
  onMark: () => void;
  onClearSelection: () => void;
  onToggleTrim: () => void;
  trimEnabled: boolean;
  trimClearDisabled: boolean;
  trimToggleDisabled: boolean;
  timeCurrentLabel: string;
  timeTotalLabel: string;
  frameInfo?: FrameInfo;
  vfrWarningMessage?: string | null;
  showFrameMapAction: boolean;
  frameMapActionLabel: string;
  onRequestFrameMap: () => void;
  showPassthroughTrimWarning: boolean;
  range?: ReactNode;
};

const PreviewToolbar = ({
  isPlaying,
  playDisabled,
  controlsDisabled,
  resolvedDuration,
  skipSeconds,
  onTogglePlayback,
  onStepBy,
  onSkipContextMenu,
  showTrimActions,
  onMark,
  onClearSelection,
  onToggleTrim,
  trimEnabled,
  trimClearDisabled,
  trimToggleDisabled,
  timeCurrentLabel,
  timeTotalLabel,
  frameInfo,
  vfrWarningMessage,
  showFrameMapAction,
  frameMapActionLabel,
  onRequestFrameMap,
  showPassthroughTrimWarning,
  range
}: PreviewToolbarProps) => (
  <div className="preview-toolbar">
    <div className="preview-toolbar-top">
      <div className="preview-controls">
        <button
          className="preview-button preview-button--toggle"
          type="button"
          onClick={onTogglePlayback}
          disabled={playDisabled}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          className="preview-button"
          type="button"
          onClick={() => onStepBy(-skipSeconds)}
          onContextMenu={onSkipContextMenu}
          disabled={!resolvedDuration || controlsDisabled}
        >
          -{skipSeconds}s
        </button>
        <button
          className="preview-button"
          type="button"
          onClick={() => onStepBy(skipSeconds)}
          onContextMenu={onSkipContextMenu}
          disabled={!resolvedDuration || controlsDisabled}
        >
          +{skipSeconds}s
        </button>
      </div>
      {showTrimActions && (
        <div className="preview-toolbar-actions">
          <button
            className="preview-button preview-button--icon"
            type="button"
            onClick={onMark}
            disabled={!resolvedDuration || controlsDisabled}
          >
            <BookmarkIcon />
            <span>Mark</span>
          </button>
          <button
            className="preview-button preview-button--ghost preview-button--icon"
            type="button"
            onClick={onClearSelection}
            aria-label="Clear selection"
            disabled={trimClearDisabled}
          >
            <ClearIcon />
          </button>
          <button
            className="preview-button preview-button--ghost"
            type="button"
            onClick={onToggleTrim}
            data-active={trimEnabled}
            disabled={trimToggleDisabled}
          >
            Use selection
          </button>
        </div>
      )}
      <div className="preview-time">
        <span>{timeCurrentLabel}</span>
        <span>/</span>
        <span>{timeTotalLabel}</span>
        {frameInfo && (
          <>
            <span className="preview-time-separator">|</span>
            <span>Frame {frameInfo.current}</span>
            <span>/</span>
            <span>{frameInfo.total}</span>
          </>
        )}
      </div>
    </div>
    {vfrWarningMessage && (
      <div className="preview-warning">
        <span>{vfrWarningMessage}</span>
        {showFrameMapAction && (
          <button
            className="preview-warning-action"
            type="button"
            onClick={onRequestFrameMap}
          >
            {frameMapActionLabel}
          </button>
        )}
      </div>
    )}
    {showPassthroughTrimWarning && (
      <div className="preview-warning">
        Passthrough trim requires re-encoding for frame-accurate cuts.
      </div>
    )}
    {range}
  </div>
);

export default PreviewToolbar;
