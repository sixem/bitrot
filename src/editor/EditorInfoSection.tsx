// Source + metadata detail cards shown beneath the main editor layout.
import formatBytes from "@/utils/formatBytes";
import formatDuration from "@/utils/formatDuration";
import type { MetadataState } from "@/editor/useVideoMetadata";

type EditorInfoSectionProps = {
  assetName: string;
  folderPath: string;
  fileType: string;
  metadataDurationSeconds?: number;
  metadataSizeBytes?: number;
  metadataFps?: number;
  metadataState: MetadataState;
  statusLabel: string;
};

// Source + metadata cards shown below the preview/editor rail.
const EditorInfoSection = ({
  assetName,
  folderPath,
  fileType,
  metadataDurationSeconds,
  metadataSizeBytes,
  metadataFps,
  metadataState,
  statusLabel
}: EditorInfoSectionProps) => {
  const resolutionLabel =
    metadataState.metadata?.width && metadataState.metadata?.height
      ? `${metadataState.metadata.width}x${metadataState.metadata.height}`
      : "--";

  return (
    <>
      <article className="editor-card">
        <div className="editor-card-header">
          <h2 className="editor-card-title">Source</h2>
          <span className="editor-pill" data-tone={metadataState.status}>
            {statusLabel}
          </span>
        </div>
        <div className="editor-kv">
          <div className="editor-kv-row">
            <span className="editor-kv-label">Name</span>
            <span className="editor-kv-value" title={assetName}>
              {assetName}
            </span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Folder</span>
            <span className="editor-kv-value" title={folderPath}>
              {folderPath}
            </span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Size</span>
            <span className="editor-kv-value">
              {metadataSizeBytes !== undefined ? formatBytes(metadataSizeBytes) : "--"}
            </span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Type</span>
            <span className="editor-kv-value">{fileType}</span>
          </div>
        </div>
      </article>

      <article className="editor-card">
        <div className="editor-card-header">
          <h2 className="editor-card-title">Metadata</h2>
          <span className="editor-card-tag">ffprobe</span>
        </div>
        <div className="editor-kv">
          <div className="editor-kv-row">
            <span className="editor-kv-label">Duration</span>
            <span className="editor-kv-value">
              {metadataDurationSeconds !== undefined
                ? formatDuration(metadataDurationSeconds)
                : "--"}
            </span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Resolution</span>
            <span className="editor-kv-value">{resolutionLabel}</span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">FPS</span>
            <span className="editor-kv-value">
              {metadataFps !== undefined ? metadataFps.toFixed(2) : "--"}
            </span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Codec</span>
            <span className="editor-kv-value">
              {metadataState.metadata?.codec ?? "--"}
            </span>
          </div>
        </div>
        {metadataState.status === "error" && metadataState.error && (
          <p className="editor-card-error">{metadataState.error}</p>
        )}
      </article>
    </>
  );
};

export default EditorInfoSection;
