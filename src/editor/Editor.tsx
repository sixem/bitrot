// Top-level editor layout + workflow coordinator.
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import useGlobalVideoDrop from "@/hooks/useGlobalVideoDrop";
import useVideoMetadata from "@/editor/useVideoMetadata";
import useFramePreview from "@/editor/useFramePreview";
import useFrameMap from "@/editor/useFrameMap";
import VideoPreview from "@/editor/VideoPreview";
import ModeCard from "@/editor/ModeCard";
import EditorProcessingCard from "@/editor/EditorProcessingCard";
import EditorInfoSection from "@/editor/EditorInfoSection";
import useFfmpegJob from "@/jobs/useFfmpegJob";
import { revealInFolder } from "@/system/reveal";
import ExportModal from "@/editor/ExportModal";
import ReceiptModal from "@/editor/ReceiptModal";
import useEditorTopRowHeight from "@/editor/useEditorTopRowHeight";
import useTrimSelection from "@/editor/useTrimSelection";
import {
  createModeConfigs,
  getModeDefinition,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import { type ExportProfile } from "@/jobs/exportProfile";
import useMetadataSummary from "@/editor/useMetadataSummary";
import useExportSettingsState from "@/editor/useExportSettingsState";
import useJobStatus from "@/editor/useJobStatus";

type EditorProps = {
  asset: VideoAsset;
  onReplace: (path: string) => void;
  onBack: () => void;
};

// Editor shell that hosts the upcoming processing workflow.
const Editor = ({ asset, onReplace, onBack }: EditorProps) => {
  const metadataState = useVideoMetadata(asset);
  const {
    statusLabel,
    metadataDurationSeconds,
    metadataSizeBytes,
    metadataFps,
    metadataIsVfr,
    fileType,
    folderPath
  } = useMetadataSummary(asset, metadataState);
  const { job, run, cancel } = useFfmpegJob();
  const { isDragging } = useGlobalVideoDrop({
    isEnabled: true,
    onVideoSelected: onReplace
  });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [receipt, setReceipt] = useState<{
    outputPath: string;
    modeId: ModeId;
    profile: ExportProfile;
  } | null>(null);
  const [modeId, setModeId] = useState<ModeId>("copy");
  const activeMode = getModeDefinition(modeId);
  const [frameMapRequestId, setFrameMapRequestId] = useState(0);
  const lastAssetPathRef = useRef(asset.path);
  const trimSelection = useTrimSelection({
    durationSeconds: metadataDurationSeconds,
    resetKey: asset.path
  });
  const [modeConfigs, setModeConfigs] = useState<ModeConfigMap>(() =>
    createModeConfigs()
  );
  const frameMapState = useFrameMap(asset, metadataIsVfr, frameMapRequestId);
  const previewControl = useFramePreview({
    asset,
    modeId,
    modeConfig: modeConfigs[modeId],
    metadata: metadataState.metadata,
    jobId: job.jobId,
    isProcessing: job.status === "running"
  });
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
  const { exportSettings, setExportSettings, outputPath } = useExportSettingsState({
    assetPath: asset.path,
    modeId,
    jobOutputPath: job.outputPath
  });
  const {
    jobStatusLabel,
    progressPercent,
    outTimeSeconds,
    totalSizeBytes,
    elapsedSeconds,
    etaSeconds,
    renderTimeSeconds,
    canRevealOutput,
    isExportDisabled
  } = useJobStatus({ job, outputPath, trimStartSeconds });
  const lastRunRef = useRef<{
    outputPath: string;
    modeId: ModeId;
    profile: ExportProfile;
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
    setFrameMapRequestId(0);
  }, [asset.path]);

  useEffect(() => {
    setReceipt(null);
  }, [asset.path]);

  useEffect(() => {
    if (!metadataIsVfr) {
      setFrameMapRequestId(0);
    }
  }, [metadataIsVfr]);

  const handleFrameMapRequest = useCallback(() => {
    setFrameMapRequestId((prev) => prev + 1);
  }, []);

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
        profile: fallback?.profile ?? exportSettings.profile
      });
    }

    lastStatusRef.current = job.status;
  }, [job.status, job.outputPath, modeId, exportSettings.profile]);

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

  const handleExportConfirm = (
    nextOutputPath: string,
    profile: ExportProfile
  ) => {
    setIsExportOpen(false);
    lastRunRef.current = {
      outputPath: nextOutputPath,
      modeId,
      profile
    };
    run(
      asset,
      trimmedDurationSeconds,
      nextOutputPath,
      modeId,
      modeConfigs[modeId],
      profile,
      trimStartSeconds,
      trimEndSeconds,
      metadataState.metadata
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

  const handleModeConfigUpdate = (
    targetModeId: ModeId,
    nextConfig: ModeConfigMap[ModeId]
  ) => {
    setModeConfigs((prev) => ({
      ...prev,
      [targetModeId]: nextConfig
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
              <div className="editor-heading">
                <button
                  className="editor-back"
                  type="button"
                  onClick={onBack}
                  title="Back to landing"
                  aria-label="Back to landing"
                >
                  &larr;
                </button>
                <p className="editor-eyebrow">BitRot Editor</p>
              </div>
              <h1 className="editor-title">{asset.name}</h1>
            </div>
          </header>
          <article className="editor-card editor-preview-card">
            <VideoPreview
              asset={asset}
              fallbackDuration={metadataState.metadata?.durationSeconds}
              fps={metadataFps}
              isVfr={metadataIsVfr}
              isPassthroughMode={activeMode.encode === "copy"}
              frameMap={frameMapState.frameMap}
              frameMapStatus={frameMapState.status}
              frameMapError={frameMapState.error}
              onRequestFrameMap={handleFrameMapRequest}
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
            modeConfigs={modeConfigs}
            onConfigChange={handleModeConfigChange}
            onModeConfigUpdate={handleModeConfigUpdate}
            disabled={job.status === "running"}
          />
          <EditorProcessingCard
            status={job.status}
            error={job.error}
            progress={job.progress}
            outputPath={outputPath}
            canRevealOutput={canRevealOutput}
            jobStatusLabel={jobStatusLabel}
            progressPercent={progressPercent}
            outTimeSeconds={outTimeSeconds}
            totalSizeBytes={totalSizeBytes}
            elapsedSeconds={elapsedSeconds}
            etaSeconds={etaSeconds}
            isExportDisabled={isExportDisabled}
            onRevealOutput={handleRevealOutput}
            onExport={handleExportOpen}
            onCancel={handleCancel}
          />
        </aside>

        <section className="editor-info" ref={infoRef}>
          <EditorInfoSection
            assetName={asset.name}
            folderPath={folderPath}
            fileType={fileType}
            metadataDurationSeconds={metadataDurationSeconds}
            metadataSizeBytes={metadataSizeBytes}
            metadataFps={metadataFps}
            metadataState={metadataState}
            statusLabel={statusLabel}
          />
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
        inputMetadata={metadataState.metadata}
        modeId={modeId}
        trimEnabled={trimEnabled}
        durationSeconds={trimmedDurationSeconds}
        onChange={setExportSettings}
        onClose={handleExportClose}
        onConfirm={handleExportConfirm}
      />
      <ReceiptModal
        isOpen={!!receipt}
        outputPath={receipt?.outputPath ?? ""}
        inputSizeBytes={metadataSizeBytes}
        modeId={receipt?.modeId ?? modeId}
        profile={receipt?.profile ?? exportSettings.profile}
        onClose={() => setReceipt(null)}
      />
    </main>
  );
};

export default Editor;
