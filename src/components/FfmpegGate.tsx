import type { FfmpegStatus } from "@/system/ffmpeg";

type FfmpegGateProps = {
  status: FfmpegStatus;
  onRetry: () => void;
};

// Blocks the UI until FFmpeg is available via local, sidecar, or PATH lookup.
const FfmpegGate = ({ status, onRetry }: FfmpegGateProps) => {
  if (status.state === "ready") {
    return null;
  }

  const isChecking = status.state === "checking";
  const title = isChecking ? "Checking FFmpeg" : "FFmpeg not found";
  const message = isChecking
    ? "Checking local, sidecar, and PATH binaries. This should only take a moment."
    : status.message;

  return (
    <div className="system-gate" role="alert" aria-live="assertive">
      <div className="system-gate-card">
        <p className="system-gate-title">{title}</p>
        <p className="system-gate-body">{message}</p>
        {!isChecking && status.details && (
          <p className="system-gate-details">{status.details}</p>
        )}
        <div className="system-gate-actions">
          <button
            className="system-gate-button"
            type="button"
            onClick={onRetry}
            disabled={isChecking}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};

export default FfmpegGate;
