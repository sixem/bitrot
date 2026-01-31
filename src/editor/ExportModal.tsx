import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  joinOutputPath,
  pathsMatch,
  replaceExtension,
  resolveExtensionForFormat,
  type OutputPathParts
} from "@/jobs/output";
import {
  DEFAULT_EXPORT_PROFILE,
  EXPORT_FORMATS,
  clampQuality,
  getAllowedEncoders,
  getFormatLabel,
  getQualityLabel,
  getQualityRange,
  getVideoEncoderLabel,
  getVideoSpeedLabel,
  normalizeProfile,
  type ExportFormat,
  type ExportProfile,
  type VideoEncoder,
  type VideoSpeed
} from "@/jobs/exportProfile";
import {
  DEFAULT_EXPORT_PRESET_ID,
  EXPORT_PRESETS,
  getExportPreset,
  type ExportPresetId,
  type ExportPreset
} from "@/jobs/exportPresets";
import {
  buildVideoEncodingArgs,
  estimateInputBitrateCapKbps,
  estimateTargetBitrateKbps
} from "@/jobs/exportEncoding";
import {
  buildAudioArgs,
  buildContainerArgs,
  getExtension,
  parseExtraArgs
} from "@/jobs/ffmpegArgs";
import type { VideoMetadata } from "@/system/ffprobe";
import type { ModeId } from "@/modes/definitions";
import useModalScrollLock from "@/ui/modal/useModalScrollLock";
import ExportPresetHeader from "@/editor/export/ExportPresetHeader";
import ExportOutputSection from "@/editor/export/ExportOutputSection";
import ExportVideoSection from "@/editor/export/ExportVideoSection";
import ExportAdvancedSection from "@/editor/export/ExportAdvancedSection";
import useNvencStatus from "@/editor/export/useNvencStatus";
import useOverwriteCheck from "@/editor/export/useOverwriteCheck";
import useSizeCapSelection from "@/editor/export/useSizeCapSelection";

export type ExportSettings = OutputPathParts & {
  profile: ExportProfile;
  presetId?: ExportPresetId;
};

type ExportModalProps = {
  isOpen: boolean;
  settings: ExportSettings;
  inputPath?: string;
  inputMetadata?: VideoMetadata;
  modeId?: ModeId;
  trimEnabled?: boolean;
  durationSeconds?: number;
  onChange: (next: ExportSettings) => void;
  onClose: () => void;
  onConfirm: (outputPath: string, profile: ExportProfile) => void;
};

const SIZE_PRESETS_MB = [5, 10, 25];
const SIZE_PRESET_OPTIONS = SIZE_PRESETS_MB.map((mb) => ({
  mb,
  kb: Math.round(mb * 1024)
}));

// Export settings modal used before running a render job.
const ExportModal = ({
  isOpen,
  settings,
  inputPath,
  inputMetadata,
  modeId,
  trimEnabled = false,
  durationSeconds,
  onChange,
  onClose,
  onConfirm
}: ExportModalProps) => {
  const shouldCloseRef = useRef(false);
  useModalScrollLock(isOpen);
  const { nvencAvailable, nvencStatus } = useNvencStatus(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const outputPath = joinOutputPath(
    settings.folder,
    settings.fileName,
    settings.separator
  );
  const folderPath = settings.folder.trim();
  const isValid = settings.fileName.trim().length > 0;
  const outputMatchesInput =
    !!inputPath && !!outputPath && pathsMatch(inputPath, outputPath);
  const profile = normalizeProfile(
    settings.profile ?? DEFAULT_EXPORT_PROFILE,
    nvencAvailable
  );
  const resetKey = `${inputPath ?? ""}|${settings.folder}|${settings.fileName}|${settings.separator}`;
  const {
    overwritePromptPath,
    missingFolderPath,
    pathCheckWarning,
    isCheckingOverwrite,
    handleConfirm
  } = useOverwriteCheck({
    isOpen,
    outputPath,
    folderPath,
    isValid,
    outputMatchesInput,
    resetKey,
    onConfirm: () => onConfirm(outputPath, profile)
  });
  const missingFolderWarning =
    missingFolderPath === ""
      ? "Output folder is required. Choose a destination folder."
      : missingFolderPath === folderPath
        ? "Output folder does not exist. Choose an existing folder."
        : null;

  const allowedEncoders = getAllowedEncoders(profile.format, nvencAvailable);
  const encoderOptions = allowedEncoders.map((encoder) => ({
    value: encoder,
    label: getVideoEncoderLabel(encoder)
  }));
  const qualityRange = getQualityRange(profile.videoEncoder);
  const qualityLabel = getQualityLabel(profile.videoEncoder);
  const isVp9 = profile.videoEncoder === "libvpx-vp9";
  const effectiveDuration =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? durationSeconds
      : inputMetadata?.durationSeconds;

  const applyProfilePatch = (patch: Partial<ExportProfile>) => {
    const next = normalizeProfile({ ...profile, ...patch }, nvencAvailable);
    onChange({ ...settings, profile: next });
  };

  const sizeCapOptions = SIZE_PRESET_OPTIONS;
  const {
    sizeCapSelection,
    sizeCapSelectOptions,
    customSizeCapLabel,
    customSizeCapValue,
    setCustomSizeCapValue,
    customInputActive,
    handleCustomCommit,
    handleSizeCapChange
  } = useSizeCapSelection({
    sizeCapMb: profile.sizeCapMb,
    sizeCapOptions,
    onSizeCapChange: (nextSizeCapMb) => applyProfilePatch({ sizeCapMb: nextSizeCapMb })
  });
  const resolvePresetCodec = (encoder?: VideoEncoder) => {
    if (encoder === "libvpx-vp9") {
      return { key: "vp9", label: "VP9" };
    }
    if (encoder === "h264_nvenc") {
      return { key: "nvenc", label: "NVENC" };
    }
    return { key: "h264", label: "H.264" };
  };

  const splitPresetLabel = (label: string) => {
    const match = label.match(/^(.*)\s+\(([^)]+)\)\s*$/);
    if (!match) {
      return { name: label.trim(), codec: undefined };
    }
    return { name: match[1].trim(), codec: match[2].trim() };
  };

  // Build preset labels with right-aligned codec tags for cleaner scanning.
  const buildPresetLabel = (preset: ExportPreset) => {
    const encoder = preset.profile.videoEncoder ?? DEFAULT_EXPORT_PROFILE.videoEncoder;
    const codec = resolvePresetCodec(encoder);
    const split = splitPresetLabel(preset.label);
    const codecLabel = split.codec || codec.label;
    return (
      <span className="export-preset-option">
        <span className="export-preset-option__name">{split.name}</span>
        <span className="export-preset-option__codec" data-codec={codec.key}>
          {codecLabel}
        </span>
      </span>
    );
  };

  const presetSortOrder: Record<string, number> = {
    h264: 1,
    nvenc: 2,
    vp9: 3
  };
  const presetOptions = [...EXPORT_PRESETS]
    .sort((left, right) => {
      const leftCodec = resolvePresetCodec(left.profile.videoEncoder).key;
      const rightCodec = resolvePresetCodec(right.profile.videoEncoder).key;
      const leftRank = presetSortOrder[leftCodec] ?? 99;
      const rightRank = presetSortOrder[rightCodec] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.label.localeCompare(right.label);
    })
    .map((preset) => ({
      value: preset.id,
      label: buildPresetLabel(preset)
    }));
  const formatOptions = EXPORT_FORMATS.map((format) => ({
    value: format,
    label: getFormatLabel(format)
  }));
  const speedOptions = (["fast", "balanced", "quality"] as VideoSpeed[]).map(
    (speed) => ({
      value: speed,
      label: getVideoSpeedLabel(speed)
    })
  );
  const passModeOptions = [
    { value: "auto", label: "Auto" },
    { value: "1pass", label: "1-pass" },
    { value: "2pass", label: "2-pass" }
  ];
  const videoModeOptions = [
    { value: "encode", label: "Encode" },
    { value: "copy", label: "Passthrough (stream copy)" }
  ];
  const canUsePassthrough = modeId === "copy" && !trimEnabled;
  const videoMode = canUsePassthrough ? profile.videoMode : "encode";

  const applyFormatChange = (nextFormat: ExportFormat) => {
    const nextAllowed = getAllowedEncoders(nextFormat, nvencAvailable);
    const nextEncoder = nextAllowed.includes(profile.videoEncoder)
      ? profile.videoEncoder
      : nextAllowed[0];
    const safeEncoder = nextAllowed.includes(nextEncoder) ? nextEncoder : nextAllowed[0];
    const nextProfile = normalizeProfile(
      {
        ...profile,
        format: nextFormat,
        videoEncoder: safeEncoder
      },
      nvencAvailable
    );
    const extension = resolveExtensionForFormat(nextFormat);
    const nextFileName = replaceExtension(settings.fileName, extension);
    onChange({ ...settings, fileName: nextFileName, profile: nextProfile });
  };

  const handlePresetChange = (presetId: ExportPresetId) => {
    const preset = getExportPreset(presetId);
    const nextProfile = normalizeProfile(
      { ...profile, ...preset.profile, format: preset.format },
      nvencAvailable
    );
    const extension = resolveExtensionForFormat(nextProfile.format);
    const nextFileName = replaceExtension(settings.fileName, extension);
    onChange({
      ...settings,
      presetId,
      fileName: nextFileName,
      profile: nextProfile
    });
  };

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    shouldCloseRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const shouldClose =
      shouldCloseRef.current && event.target === event.currentTarget;
    shouldCloseRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };

  const argsPreview = useMemo(() => {
    const bitrateCapKbps = estimateInputBitrateCapKbps(
      inputMetadata?.sizeBytes,
      inputMetadata?.durationSeconds
    );
    const targetBitrateKbps = estimateTargetBitrateKbps(
      profile.sizeCapMb,
      effectiveDuration
    );
    const videoArgs =
      videoMode === "copy"
        ? ["-c:v", "copy"]
        : buildVideoEncodingArgs(profile, {
            bitrateCapKbps,
            targetBitrateKbps
          });
    const audioArgs = profile.audioEnabled
      ? videoMode === "copy"
        ? ["-c:a", "copy"]
        : buildAudioArgs(outputPath, { enabled: true })
      : ["-an"];
    const containerArgs = buildContainerArgs(outputPath);
    const safeExtraArgs = parseExtraArgs(profile.extraArgs);
    return [...videoArgs, ...audioArgs, ...containerArgs, ...safeExtraArgs].join(" ");
  }, [
    effectiveDuration,
    inputMetadata?.durationSeconds,
    inputMetadata?.sizeBytes,
    outputPath,
    profile,
    videoMode
  ]);

  const passthroughWarning =
    videoMode === "copy" &&
    inputPath &&
    getExtension(inputPath) &&
    getExtension(inputPath) !== profile.format
      ? "Passthrough works best when the output container matches the source."
      : null;

  // Keep hook order stable; only skip rendering after all hooks are called.
  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onMouseDown={() => {
          shouldCloseRef.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <ExportPresetHeader
          presetOptions={presetOptions}
          presetId={settings.presetId ?? DEFAULT_EXPORT_PRESET_ID}
          presetDescription={
            getExportPreset(settings.presetId ?? DEFAULT_EXPORT_PRESET_ID).description
          }
          onPresetChange={handlePresetChange}
        />
        <div className="export-form scrollable">
          <ExportOutputSection
            settings={settings}
            outputPath={outputPath}
            onChange={onChange}
          />

          <ExportVideoSection
            profile={profile}
            formatOptions={formatOptions}
            encoderOptions={encoderOptions}
            speedOptions={speedOptions}
            passModeOptions={passModeOptions}
            qualityRange={qualityRange}
            qualityLabel={qualityLabel}
            isVp9={isVp9}
            sizeCapSelection={sizeCapSelection}
            sizeCapSelectOptions={sizeCapSelectOptions}
            customSizeCapLabel={customSizeCapLabel}
            customSizeCapValue={customSizeCapValue}
            customInputActive={customInputActive}
            videoMode={videoMode}
            canUsePassthrough={canUsePassthrough}
            videoModeOptions={videoModeOptions}
            passthroughWarning={passthroughWarning}
            onFormatChange={applyFormatChange}
            onEncoderChange={(nextEncoder) => {
              const nextQuality = clampQuality(nextEncoder, profile.quality);
              applyProfilePatch({ videoEncoder: nextEncoder, quality: nextQuality });
            }}
            onSpeedChange={(nextSpeed) =>
              applyProfilePatch({ videoSpeed: nextSpeed })
            }
            onQualityChange={(nextQuality) =>
              applyProfilePatch({ quality: nextQuality })
            }
            onPassModeChange={(nextMode) =>
              applyProfilePatch({ passMode: nextMode })
            }
            onSizeCapChange={handleSizeCapChange}
            onCustomSizeCapValueChange={setCustomSizeCapValue}
            onCustomSizeCapCommit={handleCustomCommit}
            onVideoModeChange={(nextMode) =>
              applyProfilePatch({ videoMode: nextMode })
            }
            onToggleAudio={() =>
              applyProfilePatch({ audioEnabled: !profile.audioEnabled })
            }
          />

          <ExportAdvancedSection
            extraArgs={profile.extraArgs}
            argsPreview={argsPreview}
            onExtraArgsChange={(nextValue) =>
              applyProfilePatch({ extraArgs: nextValue })
            }
          />

          {outputMatchesInput && (
            <p className="export-warning export-warning--error">
              Output matches the source file. Choose a different filename to avoid
              overwriting the original.
            </p>
          )}
          {!outputMatchesInput && missingFolderWarning && (
            <p className="export-warning export-warning--error">
              {missingFolderWarning}
            </p>
          )}
          {!outputMatchesInput && overwritePromptPath === outputPath && (
            <p className="export-warning">
              Output already exists. Click Overwrite to replace it.
            </p>
          )}
          {!outputMatchesInput && !overwritePromptPath && pathCheckWarning && (
            <p className="export-warning">{pathCheckWarning}</p>
          )}
        </div>
        <div className="export-actions">
          <div className="export-actions-left">
            {(nvencStatus === "supported" || nvencStatus === "unsupported") && (
              <div className="export-tags">
                {nvencStatus === "supported" && (
                  <span className="export-tag" data-tone="ready">
                    NVENC detected
                  </span>
                )}
                {nvencStatus === "unsupported" && (
                  <span className="export-tag" data-tone="muted">
                    NVENC not detected
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="export-actions-right">
            <button className="modal-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="modal-button modal-button--primary"
              type="button"
              onClick={handleConfirm}
              disabled={!isValid || isCheckingOverwrite || outputMatchesInput}
            >
              {overwritePromptPath === outputPath ? "Overwrite" : "Export"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExportModal;

