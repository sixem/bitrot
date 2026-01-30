import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  type PassMode,
  type VideoEncoder,
  type VideoMode,
  type VideoSpeed
} from "@/jobs/exportProfile";
import {
  DEFAULT_EXPORT_PRESET_ID,
  EXPORT_PRESETS,
  getExportPreset,
  type ExportPresetId
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
import { getNvencSupportStatus, probeNvencSupport } from "@/jobs/encoding";
import type { VideoMetadata } from "@/system/ffprobe";
import { pathExists } from "@/system/pathExists";
import type { ModeId } from "@/modes/definitions";
import Select from "@/ui/controls/Select";

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
  const [nvencStatus, setNvencStatus] = useState(getNvencSupportStatus());
  const [overwritePromptPath, setOverwritePromptPath] = useState<string | null>(null);
  const [missingFolderPath, setMissingFolderPath] = useState<string | null>(null);
  const [pathCheckWarning, setPathCheckWarning] = useState<string | null>(null);
  const [isCheckingOverwrite, setIsCheckingOverwrite] = useState(false);

  const nvencAvailable = nvencStatus === "supported";

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let isActive = true;
    probeNvencSupport()
      .then(() => {
        if (isActive) {
          setNvencStatus(getNvencSupportStatus());
        }
      })
      .catch(() => {
        if (isActive) {
          setNvencStatus(getNvencSupportStatus());
        }
      });
    return () => {
      isActive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setOverwritePromptPath(null);
    setMissingFolderPath(null);
    setPathCheckWarning(null);
  }, [isOpen, inputPath, settings.folder, settings.fileName, settings.separator]);

  const outputPath = joinOutputPath(
    settings.folder,
    settings.fileName,
    settings.separator
  );
  const folderPath = settings.folder.trim();
  const isValid = settings.fileName.trim().length > 0;
  const outputMatchesInput =
    !!inputPath && !!outputPath && pathsMatch(inputPath, outputPath);
  const missingFolderWarning =
    missingFolderPath === ""
      ? "Output folder is required. Choose a destination folder."
      : missingFolderPath === folderPath
        ? "Output folder does not exist. Choose an existing folder."
        : null;

  const profile = normalizeProfile(
    settings.profile ?? DEFAULT_EXPORT_PROFILE,
    nvencAvailable
  );
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
  const sizeCapOptions = SIZE_PRESET_OPTIONS;
  const defaultCustomSizeCap = sizeCapOptions[0]?.kb ?? 5120;
  // Normalize the optional size cap into a stable number for reuse and narrowing.
  const sizeCapMb =
    typeof profile.sizeCapMb === "number" &&
    Number.isFinite(profile.sizeCapMb) &&
    profile.sizeCapMb > 0
      ? profile.sizeCapMb
      : undefined;
  const sizeCapPreset =
    sizeCapMb !== undefined
      ? sizeCapOptions.find((option) => Math.round(sizeCapMb * 1024) === option.kb)
      : undefined;
  const [customSizeCapValue, setCustomSizeCapValue] = useState(() => {
    if (sizeCapMb !== undefined) {
      return String(Math.round(sizeCapMb * 1024));
    }
    return String(defaultCustomSizeCap);
  });
  const [isCustomSizeCap, setIsCustomSizeCap] = useState(
    sizeCapMb !== undefined && !sizeCapPreset
  );
  const sizeCapSelection = isCustomSizeCap
    ? "custom"
    : sizeCapPreset
      ? String(sizeCapPreset.kb)
      : sizeCapMb !== undefined
        ? "custom"
      : "off";

  useEffect(() => {
    // Use the normalized size to avoid undefined checks inside callbacks.
    if (sizeCapMb === undefined) {
      setIsCustomSizeCap(false);
      return;
    }
    const preset = sizeCapOptions.find(
      (option) => Math.round(sizeCapMb * 1024) === option.kb
    );
    if (preset) {
      setIsCustomSizeCap(false);
      return;
    }
    setCustomSizeCapValue(String(Math.round(sizeCapMb * 1024)));
    setIsCustomSizeCap(true);
  }, [sizeCapMb, sizeCapOptions]);
  const presetOptions = EXPORT_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label
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
  const sizeCapSelectOptions = [
    { value: "off", label: "Off" },
    ...sizeCapOptions.map((option) => ({
      value: String(option.kb),
      label: `${option.kb} KB`
    }))
  ];
  const videoModeOptions = [
    { value: "encode", label: "Encode" },
    { value: "copy", label: "Passthrough (stream copy)" }
  ];
  const customSizeCapLabel = customSizeCapValue
    ? `Custom - ${customSizeCapValue} KB`
    : "Custom";
  const canUsePassthrough = modeId === "copy" && !trimEnabled;
  const videoMode = canUsePassthrough ? profile.videoMode : "encode";

  const applyProfilePatch = (patch: Partial<ExportProfile>) => {
    const next = normalizeProfile({ ...profile, ...patch }, nvencAvailable);
    onChange({ ...settings, profile: next });
  };

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
    setIsCustomSizeCap(false);
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

  // Confirm export after validating the output folder and overwrite state.
  const handleConfirm = async () => {
    if (!isValid || isCheckingOverwrite || outputMatchesInput) {
      return;
    }

    if (overwritePromptPath === outputPath) {
      onConfirm(outputPath, profile);
      return;
    }
    if (pathCheckWarning) {
      setPathCheckWarning(null);
      onConfirm(outputPath, profile);
      return;
    }
    if (overwritePromptPath) {
      setOverwritePromptPath(null);
    }

    setIsCheckingOverwrite(true);
    // Verify destination folder exists before checking for overwrite.
    if (!folderPath) {
      setMissingFolderPath("");
      setIsCheckingOverwrite(false);
      return;
    }
    const folderExists = await pathExists(folderPath);
    if (folderExists === false) {
      setMissingFolderPath(folderPath);
      setIsCheckingOverwrite(false);
      return;
    }
    if (folderExists === null) {
      setPathCheckWarning("Unable to verify the output folder. Click Export to proceed.");
      setIsCheckingOverwrite(false);
      return;
    }
    if (missingFolderPath) {
      setMissingFolderPath(null);
    }

    const exists = await pathExists(outputPath);
    setIsCheckingOverwrite(false);

    if (exists === null) {
      setPathCheckWarning("Unable to verify whether the output exists. Click Export to proceed.");
      return;
    }
    if (exists) {
      setOverwritePromptPath(outputPath);
      return;
    }

    onConfirm(outputPath, profile);
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
        <div className="export-title">
          <div className="export-title-main">
            <h2 id="export-modal-title" className="modal-title">
              Export settings
            </h2>
          </div>
          <div className="export-title-side">
            <div className="export-preset">
              <Select
                className="export-input export-select"
                value={settings.presetId ?? DEFAULT_EXPORT_PRESET_ID}
                ariaLabel="Export preset"
                options={presetOptions}
                onChange={(nextValue) =>
                  handlePresetChange(nextValue as ExportPresetId)
                }
              />
              <p className="export-help export-help--tight">
                {getExportPreset(
                  settings.presetId ?? DEFAULT_EXPORT_PRESET_ID
                ).description}
              </p>
            </div>
          </div>
        </div>
        <div className="export-form">
          <div className="export-section export-section--wide">
            <div className="export-section-header">Output</div>
            <div className="export-grid export-grid--output">
              <label className="export-field">
                <span className="export-label">Output folder</span>
                <input
                  className="export-input"
                  type="text"
                  value={settings.folder}
                  onChange={(event) =>
                    onChange({ ...settings, folder: event.target.value })
                  }
                  placeholder="Folder path"
                />
              </label>
              <label className="export-field">
                <span className="export-label">File name</span>
                <input
                  className="export-input"
                  type="text"
                  value={settings.fileName}
                  onChange={(event) =>
                    onChange({ ...settings, fileName: event.target.value })
                  }
                  placeholder="output.bitrot.mp4"
                />
              </label>
            </div>
            <p className="export-path" title={outputPath}>
              {outputPath || "Output path will appear here."}
            </p>
          </div>

          <div className="export-section export-section--wide">
            <div className="export-section-header">Format &amp; video</div>
            <div className="export-grid">
              <label className="export-field">
                <span className="export-label">Format</span>
                <Select
                  className="export-input export-select"
                  value={profile.format}
                  options={formatOptions}
                  onChange={(nextValue) =>
                    applyFormatChange(nextValue as ExportFormat)
                  }
                />
              </label>
              <label className="export-field">
                <span className="export-label">Encoder</span>
                <Select
                  className="export-input export-select"
                  value={profile.videoEncoder}
                  options={encoderOptions}
                  onChange={(nextValue) => {
                    const nextEncoder = nextValue as VideoEncoder;
                    const nextQuality = clampQuality(nextEncoder, profile.quality);
                    applyProfilePatch({
                      videoEncoder: nextEncoder,
                      quality: nextQuality
                    });
                  }}
                />
              </label>
              <label className="export-field">
                <span className="export-label">Speed</span>
                <Select
                  className="export-input export-select"
                  value={profile.videoSpeed}
                  options={speedOptions}
                  onChange={(nextValue) =>
                    applyProfilePatch({
                      videoSpeed: nextValue as VideoSpeed
                    })
                  }
                />
              </label>
              <label className="export-field">
                <span className="export-label">{qualityLabel}</span>
                <input
                  className="export-input export-input--range range-input"
                  type="range"
                  min={qualityRange.min}
                  max={qualityRange.max}
                  step={qualityRange.step}
                  value={profile.quality}
                  onChange={(event) =>
                    applyProfilePatch({
                      quality: Number.parseInt(event.target.value, 10)
                    })
                  }
                />
                <p className="export-help">
                  {qualityLabel} {profile.quality}
                </p>
              </label>
              <label className="export-field">
                <span className="export-label">Passes</span>
                <Select
                  className="export-input export-select"
                  value={isVp9 ? profile.passMode : "auto"}
                  disabled={!isVp9}
                  options={passModeOptions}
                  onChange={(nextValue) =>
                    applyProfilePatch({ passMode: nextValue as PassMode })
                  }
                />
                {!isVp9 && (
                  <p className="export-help">Pass selection is VP9-only.</p>
                )}
              </label>
              <label className="export-field">
                <span className="export-label">Size (best-effort, KB)</span>
                <Select
                  className="export-input export-select"
                  value={sizeCapSelection}
                  options={sizeCapSelectOptions}
                  customInput={{
                    valueKey: "custom",
                    label: "Custom",
                    displayLabel: customSizeCapLabel,
                    value: customSizeCapValue,
                    unit: "KB",
                    placeholder: "Size in KB",
                    onValueChange: setCustomSizeCapValue,
                    onCommit: (nextValue) => {
                      const parsed = Number.parseFloat(nextValue);
                      if (!Number.isFinite(parsed) || parsed <= 0) {
                        return;
                      }
                      setIsCustomSizeCap(true);
                      applyProfilePatch({ sizeCapMb: parsed / 1024 });
                    }
                  }}
                  customInputActive={sizeCapSelection === "custom"}
                  onChange={(nextValue) => {
                    if (nextValue === "off") {
                      setIsCustomSizeCap(false);
                      applyProfilePatch({ sizeCapMb: undefined });
                      return;
                    }
                    if (nextValue === "custom") {
                      const parsed = Number.parseFloat(customSizeCapValue);
                      const fallback = sizeCapMb ?? (sizeCapOptions[0]?.mb ?? 5);
                      setIsCustomSizeCap(true);
                      applyProfilePatch({
                        sizeCapMb:
                          Number.isFinite(parsed) && parsed > 0
                            ? parsed / 1024
                            : fallback
                      });
                      return;
                    }
                    const parsed = Number.parseFloat(nextValue);
                    setIsCustomSizeCap(false);
                    applyProfilePatch({
                      sizeCapMb: Number.isFinite(parsed) ? parsed / 1024 : undefined
                    });
                  }}
                />
              </label>
              <label className="export-field">
                <span className="export-label">Video handling</span>
                <Select
                  className="export-input export-select"
                  value={videoMode}
                  disabled={!canUsePassthrough}
                  options={videoModeOptions}
                  onChange={(nextValue) =>
                    applyProfilePatch({
                      videoMode: nextValue as VideoMode
                    })
                  }
                />
                {!canUsePassthrough && (
                  <p className="export-help">
                    Passthrough is only available for the Passthrough mode without
                    trim.
                  </p>
                )}
              </label>
              <label className="export-field export-field--toggle">
                <span className="export-label">Audio</span>
                <button
                  className="export-toggle export-toggle--input"
                  type="button"
                  data-active={profile.audioEnabled}
                  onClick={() =>
                    applyProfilePatch({ audioEnabled: !profile.audioEnabled })
                  }
                >
                  {profile.audioEnabled ? "Audio on" : "Audio off"}
                </button>
              </label>
            </div>
            {passthroughWarning && (
              <p className="export-warning">{passthroughWarning}</p>
            )}
          </div>

          <div className="export-section export-section--wide">
            <div className="export-section-header">Advanced</div>
            <label className="export-field">
              <span className="export-label">Extra ffmpeg args (safe)</span>
              <textarea
                className="export-input export-textarea"
                value={profile.extraArgs}
                onChange={(event) =>
                  applyProfilePatch({ extraArgs: event.target.value })
                }
                placeholder='Example: -tune film -profile:v high'
              />
              <p className="export-help">
                Unsupported or unsafe args are ignored. Common flags: -tune,
                -profile:v, -level, -threads, -row-mt.
              </p>
            </label>
            <div className="export-args">
              <span className="export-label">Generated args</span>
              <code>{argsPreview || "--"}</code>
            </div>
          </div>

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

