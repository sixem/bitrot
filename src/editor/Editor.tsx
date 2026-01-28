import { useEffect, useRef, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import useGlobalVideoDrop from "@/hooks/useGlobalVideoDrop";
import formatBytes from "@/utils/formatBytes";
import formatDuration from "@/utils/formatDuration";
import useVideoMetadata from "@/editor/useVideoMetadata";
import useFramePreview from "@/editor/useFramePreview";
import useFrameMap from "@/editor/useFrameMap";
import VideoPreview from "@/editor/VideoPreview";
import ModeCard from "@/editor/ModeCard";
import useFfmpegJob from "@/jobs/useFfmpegJob";
import {
  buildDefaultOutputPath,
  joinOutputPath,
  splitOutputPath
} from "@/jobs/output";
import { revealInFolder } from "@/system/reveal";
import ExportModal, { type ExportSettings } from "@/editor/ExportModal";
import ReceiptModal from "@/editor/ReceiptModal";
import useEditorTopRowHeight from "@/editor/useEditorTopRowHeight";
import useTrimSelection from "@/editor/useTrimSelection";
import {
  createModeConfigs,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import type { EncodingId } from "@/jobs/encoding";

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
  const [receipt, setReceipt] = useState<{
    outputPath: string;
    modeId: ModeId;
    encodingId: EncodingId;
  } | null>(null);
  const [modeId, setModeId] = useState<ModeId>("analog");
  const lastAssetPathRef = useRef(asset.path);
  const metadataDurationSeconds =
    typeof metadataState.metadata?.durationSeconds === "number" &&
    Number.isFinite(metadataState.metadata.durationSeconds)
      ? metadataState.metadata.durationSeconds
      : undefined;
  const trimSelection = useTrimSelection({
    durationSeconds: metadataDurationSeconds,
    resetKey: asset.path
  });
  const [modeConfigs, setModeConfigs] = useState<ModeConfigMap>(() =>
    createModeConfigs()
  );
  const previewControl = useFramePreview({
    asset,
    modeId,
    modeConfig: modeConfigs[modeId],
    metadata: metadataState.metadata,
    isProcessing: job.status === "running",
    trim: trimSelection.selection
  });
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
  const metadataSizeBytes =
    typeof metadataState.metadata?.sizeBytes === "number" &&
    Number.isFinite(metadataState.metadata.sizeBytes)
      ? metadataState.metadata.sizeBytes
      : undefined;
  const metadataFps =
    typeof metadataState.metadata?.fps === "number" &&
    Number.isFinite(metadataState.metadata.fps)
      ? metadataState.metadata.fps
      : undefined;
  const metadataIsVfr = metadataState.metadata?.isVfr ?? false;
  const frameMapState = useFrameMap(asset, metadataIsVfr);
  const trimEnabled = trimSelection.selection.enabled && trimSelection.selection.isValid;
  const trimStartSeconds =
    trimEnabled && typeof trimSelection.selection.start === "number"
      ? trimSelection.selection.start
      : undefined;
  const trimEndSeconds =
    trimEnabled && typeof trimSelection.selection.end === "number"
      ? trimSelection.selection.end
      : undefined;
  const trimmedDurationSeconds =
    trimStartSeconds !== undefined && trimEndSeconds !== undefined
      ? Math.max(0, trimEndSeconds - trimStartSeconds)
      : metadataDurationSeconds;
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
  const canRevealOutput = job.status === "success" && outputPath.trim().length > 0;
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
  const outTimeSeconds =
    typeof job.progress.outTimeSeconds === "number" &&
    Number.isFinite(job.progress.outTimeSeconds)
      ? job.progress.outTimeSeconds
      : undefined;
  const totalSizeBytes =
    typeof job.progress.totalSizeBytes === "number" &&
    Number.isFinite(job.progress.totalSizeBytes)
      ? job.progress.totalSizeBytes
      : undefined;
  const elapsedSeconds =
    typeof job.progress.elapsedSeconds === "number" &&
    Number.isFinite(job.progress.elapsedSeconds)
      ? job.progress.elapsedSeconds
      : undefined;
  const etaSeconds =
    typeof job.progress.etaSeconds === "number" &&
    Number.isFinite(job.progress.etaSeconds)
      ? job.progress.etaSeconds
      : undefined;
  const renderTimeSeconds =
    job.status === "running" &&
    typeof job.progress.outTimeSeconds === "number" &&
    Number.isFinite(job.progress.outTimeSeconds)
      ? trimStartSeconds !== undefined
        ? trimStartSeconds + job.progress.outTimeSeconds
        : job.progress.outTimeSeconds
      : undefined;
  const isExportDisabled = job.status === "running";
  const lastRunRef = useRef<{
    outputPath: string;
    modeId: ModeId;
    encodingId: EncodingId;
  } | null>(null);
  const lastStatusRef = useRef(job.status);
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
    setExportSettings((prev) => ({
      ...splitOutputPath(defaultOutputPath),
      // Preserve the user's encoding selection when the mode changes.
      encodingId: prev.encodingId
    }));
  }, [defaultOutputPath]);

  useEffect(() => {
    if (job.status === "running") {
      setReceipt(null);
    }

    if (lastStatusRef.current !== "success" && job.status === "success") {
      const fallback = lastRunRef.current;
      const outputPathValue = job.outputPath ?? fallback?.outputPath ?? "";
      setReceipt({
        outputPath: outputPathValue,
        modeId: fallback?.modeId ?? modeId,
        encodingId: fallback?.encodingId ?? exportSettings.encodingId
      });
    }

    lastStatusRef.current = job.status;
  }, [job.status, job.outputPath, modeId, exportSettings.encodingId]);

  useEffect(() => {
    if (
      lastAssetPathRef.current &&
      lastAssetPathRef.current !== asset.path &&
      job.status === "running"
    ) {
      cancel();
    }
    lastAssetPathRef.current = asset.path;
  }, [asset.path, job.status, cancel]);

  const handleExportOpen = () => {
    setIsExportOpen(true);
  };

  const handleExportClose = () => {
    setIsExportOpen(false);
  };

  const handleExportConfirm = (nextOutputPath: string, encodingId: EncodingId) => {
    setIsExportOpen(false);
    lastRunRef.current = {
      outputPath: nextOutputPath,
      modeId,
      encodingId
    };
    run(
      asset,
      trimmedDurationSeconds,
      nextOutputPath,
      modeId,
      modeConfigs[modeId],
      encodingId,
      trimStartSeconds,
      trimEndSeconds
    );
  };

  const handleRevealOutput = async () => {
    if (!canRevealOutput) {
      return;
    }
    try {
      await revealInFolder(outputPath);
    } catch {
      // Best-effort: revealing the file should not block the editor.
    }
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
      <section className="editor-layout" ref={layoutRef}>
        <div className="editor-left">
          <header className="editor-header" ref={headerRef}>
            <div>
              <p className="editor-eyebrow">BitRot Editor</p>
              <h1 className="editor-title">{asset.name}</h1>
            </div>
          </header>
          <article className="editor-card editor-preview-card">
            <VideoPreview
              asset={asset}
              fallbackDuration={metadataState.metadata?.durationSeconds}
              fps={metadataFps}
              isVfr={metadataIsVfr}
              isCopyMode={modeId === "copy"}
              frameMap={frameMapState.frameMap}
              frameMapStatus={frameMapState.status}
              frameMapError={frameMapState.error}
              preview={previewControl}
              renderTimeSeconds={renderTimeSeconds}
              trim={trimSelection}
            />
          </article>
        </div>

        <aside className="editor-rail" ref={railRef}>
          <ModeCard
            value={modeId}
            onChange={handleModeChange}
            config={modeConfigs[modeId]}
            onConfigChange={handleModeConfigChange}
            disabled={job.status === "running"}
          />

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
                <button
                  className="editor-kv-value editor-kv-value--action"
                  type="button"
                  onClick={handleRevealOutput}
                  title={outputPath}
                  disabled={!canRevealOutput}
                >
                  {outputPath}
                </button>
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
                  {outTimeSeconds !== undefined ? formatDuration(outTimeSeconds) : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Frames</span>
                <span className="editor-kv-value">
                  {typeof job.progress.frame === "number" &&
                  Number.isFinite(job.progress.frame)
                    ? job.progress.frame
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">FPS</span>
                <span className="editor-kv-value">
                  {typeof job.progress.fps === "number" &&
                  Number.isFinite(job.progress.fps)
                    ? job.progress.fps.toFixed(2)
                    : "--"}
                </span>
              </div>
              <div className="editor-kv-row">
                <span className="editor-kv-label">Speed</span>
                <span className="editor-kv-value">
                  {typeof job.progress.speed === "number" &&
                  Number.isFinite(job.progress.speed)
                    ? `${job.progress.speed.toFixed(2)}x`
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
                <span className="editor-kv-value">
                  {job.progress.bitrate ?? "--"}
                </span>
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
                <span className="editor-kv-value">
                  {metadataState.metadata?.width && metadataState.metadata?.height
                    ? `${metadataState.metadata.width}x${metadataState.metadata.height}`
                    : "--"}
                </span>
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
        inputPath={asset.path}
        onChange={setExportSettings}
        onClose={handleExportClose}
        onConfirm={handleExportConfirm}
      />
      <ReceiptModal
        isOpen={!!receipt}
        outputPath={receipt?.outputPath ?? ""}
        modeId={receipt?.modeId ?? modeId}
        encodingId={receipt?.encodingId ?? exportSettings.encodingId}
        onClose={() => setReceipt(null)}
      />
    </main>
  );
};

export default Editor;
