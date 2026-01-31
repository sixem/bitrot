// Processing status card for the editor rail (progress + export actions).
import formatBytes from "@/utils/formatBytes";
import formatDuration from "@/utils/formatDuration";
import type { JobProgress, JobStatus } from "@/jobs/types";

type EditorProcessingCardProps = {
  status: JobStatus;
  error?: string;
  progress: JobProgress;
  outputPath: string;
  canRevealOutput: boolean;
  jobStatusLabel: string;
  progressPercent: number;
  outTimeSeconds?: number;
  totalSizeBytes?: number;
  elapsedSeconds?: number;
  etaSeconds?: number;
  isExportDisabled: boolean;
  onRevealOutput: () => void;
  onExport: () => void;
  onCancel: () => void;
};

// Processing details + export controls for the editor rail.
const EditorProcessingCard = ({
  status,
  error,
  progress,
  outputPath,
  canRevealOutput,
  jobStatusLabel,
  progressPercent,
  outTimeSeconds,
  totalSizeBytes,
  elapsedSeconds,
  etaSeconds,
  isExportDisabled,
  onRevealOutput,
  onExport,
  onCancel
}: EditorProcessingCardProps) => (
  <article className="editor-card editor-processing-card">
    <div className="editor-card-header">
      <h2 className="editor-card-title">Processing</h2>
      <span className="editor-pill" data-tone={status}>
        {jobStatusLabel}
      </span>
    </div>
    <div className="editor-kv">
      <div className="editor-kv-row">
        <span className="editor-kv-label">Output</span>
        <button
          className="editor-kv-value editor-kv-value--action"
          type="button"
          onClick={onRevealOutput}
          title={outputPath}
          disabled={!canRevealOutput}
        >
          {outputPath}
        </button>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">Progress</span>
        <span className="editor-kv-value">{progressPercent.toFixed(1)}%</span>
      </div>
    </div>

    <div className="job-progress">
      <div className="job-progress-bar" style={{ width: `${progressPercent}%` }} />
    </div>

    <div className="editor-kv editor-kv--dense">
      <div className="editor-kv-row">
        <span className="editor-kv-label">Time</span>
        <span className="editor-kv-value">
          {outTimeSeconds !== undefined ? formatDuration(outTimeSeconds) : "--"}
        </span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">Frames</span>
        <span className="editor-kv-value">
          {typeof progress.frame === "number" && Number.isFinite(progress.frame)
            ? progress.frame
            : "--"}
        </span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">FPS</span>
        <span className="editor-kv-value">
          {typeof progress.fps === "number" && Number.isFinite(progress.fps)
            ? progress.fps.toFixed(2)
            : "--"}
        </span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">Speed</span>
        <span className="editor-kv-value">
          {typeof progress.speed === "number" && Number.isFinite(progress.speed)
            ? `${progress.speed.toFixed(2)}x`
            : "--"}
        </span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">Elapsed</span>
        <span className="editor-kv-value">
          {elapsedSeconds !== undefined ? formatDuration(elapsedSeconds) : "--"}
        </span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">ETA</span>
        <span className="editor-kv-value">
          {etaSeconds !== undefined ? formatDuration(etaSeconds) : "--"}
        </span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">Bitrate</span>
        <span className="editor-kv-value">{progress.bitrate ?? "--"}</span>
      </div>
      <div className="editor-kv-row">
        <span className="editor-kv-label">Size</span>
        <span className="editor-kv-value">
          {totalSizeBytes !== undefined ? formatBytes(totalSizeBytes) : "--"}
        </span>
      </div>
    </div>

    <div className="processing-actions">
      <button
        className="editor-button editor-button--primary"
        type="button"
        onClick={onExport}
        disabled={isExportDisabled}
      >
        {status === "running" ? "Running..." : "Export"}
      </button>
      {status === "running" && (
        <button className="editor-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>

    {status === "error" && error && <p className="editor-card-error">{error}</p>}
  </article>
);

export default EditorProcessingCard;
