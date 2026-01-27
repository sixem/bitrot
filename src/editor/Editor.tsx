import { useEffect, useRef, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import useGlobalVideoDrop from "@/hooks/useGlobalVideoDrop";
import formatBytes from "@/utils/formatBytes";
import formatDuration from "@/utils/formatDuration";
import useVideoMetadata from "@/editor/useVideoMetadata";
import VideoPreview from "@/editor/VideoPreview";
import ModeCard from "@/editor/ModeCard";
import useFfmpegJob from "@/jobs/useFfmpegJob";
import {
  buildDefaultOutputPath,
  joinOutputPath,
  splitOutputPath
} from "@/jobs/output";
import ExportModal, { type ExportSettings } from "@/editor/ExportModal";
import useEditorTopRowHeight from "@/editor/useEditorTopRowHeight";
import {
  createModeConfigs,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";

type EditorProps = {
  asset: VideoAsset;
  onReplace: (path: string) => void;
};

// Editor shell that hosts the upcoming processing workflow.
const Editor = ({ asset, onReplace }: EditorProps) => {
  const metadataState = useVideoMetadata(asset);
  const { job, run, cancel } = useFfmpegJob();
  const { isDragging } = useGlobalVideoDrop({
    isEnabled: true,
    onVideoSelected: onReplace
  });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [modeId, setModeId] = useState<ModeId>("analog");
  const [modeConfigs, setModeConfigs] = useState<ModeConfigMap>(() =>
    createModeConfigs()
  );
  const statusLabel =
    metadataState.status === "loading"
      ? "Analyzing"
      : metadataState.status === "ready"
        ? "Ready"
        : metadataState.status === "error"
          ? "Metadata error"
          : "Awaiting analysis";
  const fileType = asset.name.split(".").pop()?.toUpperCase() ?? "--";
  const folderPath = asset.path
    ? asset.path.replace(/[/\\\\][^/\\\\]+$/, "")
    : "--";
  const defaultOutputPath = buildDefaultOutputPath(
    asset.path,
    modeId === "copy" ? undefined : "mp4"
  );
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() =>
    splitOutputPath(defaultOutputPath)
  );
  const outputPath =
    job.outputPath ??
    joinOutputPath(
      exportSettings.folder,
      exportSettings.fileName,
      exportSettings.separator
    );
  const jobStatusLabel =
    job.status === "running"
      ? "Running"
      : job.status === "success"
        ? "Complete"
        : job.status === "error"
          ? "Failed"
          : job.status === "canceled"
            ? "Canceled"
            : "Idle";
  const progressPercent = Number.isFinite(job.progress.percent)
    ? job.progress.percent
    : 0;
  const isExportDisabled = job.status === "running";
  const shellRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const layoutRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const infoRef = useRef<HTMLElement>(null);

  useEditorTopRowHeight({
    shellRef,
    headerRef,
    layoutRef,
    railRef,
    infoRef
  });

  useEffect(() => {
    setExportSettings(splitOutputPath(defaultOutputPath));
  }, [defaultOutputPath]);

  const handleExportOpen = () => {
    setIsExportOpen(true);
  };

  const handleExportClose = () => {
    setIsExportOpen(false);
  };

  const handleExportConfirm = (nextOutputPath: string) => {
    setIsExportOpen(false);
    run(
      asset,
      metadataState.metadata?.durationSeconds,
      nextOutputPath,
      modeId,
      modeConfigs[modeId]
    );
  };

  const handleModeChange = (nextMode: ModeId) => {
    setModeId(nextMode);
  };

  const handleModeConfigChange = (nextConfig: ModeConfigMap[ModeId]) => {
    setModeConfigs((prev) => ({
      ...prev,
      [modeId]: nextConfig
    }));
  };

  const handleCancel = () => {
    cancel();
  };

  return (
    <main className="editor-shell" data-dragging={isDragging} ref={shellRef}>
      <header className="editor-header" ref={headerRef}>
        <div>
          <p className="editor-eyebrow">Editor</p>
          <h1 className="editor-title">{asset.name}</h1>
        </div>
      </header>

      <section className="editor-layout" ref={layoutRef}>
        <article className="editor-card editor-preview-card">
          <VideoPreview
            asset={asset}
            fallbackDuration={metadataState.metadata?.durationSeconds}
          />
        </article>

        <aside className="editor-rail" ref={railRef}>
          <article className="editor-card editor-processing-card">
            <div className="editor-card-header">
              <h2 className="editor-card-title">Processing</h2>
              <span className="editor-pill" data-tone={job.status}>
                {jobStatusLabel}
              </span>
            </div>
            <div className="editor-kv">
              <div className="editor-kv-row">
                <span className="editor-kv-label">Output</span>
                <span className="editor-kv-value" title={outputPath}>
                  {outputPath}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Progress</span>
                <span className="editor-kv-value">
                  {progressPercent.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="job-progress">
              <div
                className="job-progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="editor-kv editor-kv--dense">
              <div className="editor-kv-row">
                <span className="editor-kv-label">Time</span>
                <span className="editor-kv-value">
                  {Number.isFinite(job.progress.outTimeSeconds)
                    ? formatDuration(job.progress.outTimeSeconds)
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Frames</span>
                <span className="editor-kv-value">
                  {Number.isFinite(job.progress.frame) ? job.progress.frame : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">FPS</span>
                <span className="editor-kv-value">
                  {Number.isFinite(job.progress.fps)
                    ? job.progress.fps.toFixed(2)
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Speed</span>
                <span className="editor-kv-value">
                  {Number.isFinite(job.progress.speed)
                    ? `${job.progress.speed.toFixed(2)}x`
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Bitrate</span>
                <span className="editor-kv-value">
                  {job.progress.bitrate ?? "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Size</span>
                <span className="editor-kv-value">
                  {Number.isFinite(job.progress.totalSizeBytes)
                    ? formatBytes(job.progress.totalSizeBytes)
                    : "--"}
                </span>
              </div>
            </div>

            <div className="processing-actions">
              <button
                className="editor-button editor-button--primary"
                type="button"
                onClick={handleExportOpen}
                disabled={isExportDisabled}
              >
                {job.status === "running" ? "Running..." : "Export"}
              </button>
              {job.status === "running" && (
                <button className="editor-button" type="button" onClick={handleCancel}>
                  Cancel
                </button>
              )}
            </div>

            {job.status === "error" && job.error && (
              <p className="editor-card-error">{job.error}</p>
            )}
          </article>

          <ModeCard
            value={modeId}
            onChange={handleModeChange}
            config={modeConfigs[modeId]}
            onConfigChange={handleModeConfigChange}
            disabled={job.status === "running"}
          />
        </aside>

        <section className="editor-info" ref={infoRef}>
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
                <span className="editor-kv-value" title={asset.name}>
                  {asset.name}
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
                  {metadataState.metadata?.sizeBytes
                    ? formatBytes(metadataState.metadata.sizeBytes)
                    : "--"}
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
                  {metadataState.metadata?.durationSeconds
                    ? formatDuration(metadataState.metadata.durationSeconds)
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Resolution</span>
                <span className="editor-kv-value">
                  {metadataState.metadata?.width && metadataState.metadata?.height
                    ? `${metadataState.metadata.width}x${metadataState.metadata.height}`
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">FPS</span>
                <span className="editor-kv-value">
                  {metadataState.metadata?.fps
                    ? metadataState.metadata.fps.toFixed(2)
                    : "--"}
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
        </section>
      </section>

      <div className="drag-overlay" data-active={isDragging}>
        <div className="drag-overlay-inner">
          <p className="drag-title">Drop to replace</p>
          <p className="drag-subtitle">New clip loads immediately.</p>
        </div>
      </div>

      <ExportModal
        isOpen={isExportOpen}
        settings={exportSettings}
        onChange={setExportSettings}
        onClose={handleExportClose}
        onConfirm={handleExportConfirm}
      />
    </main>
  );
};

export default Editor;
