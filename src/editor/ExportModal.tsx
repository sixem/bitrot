import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { joinOutputPath, pathsMatch, type OutputPathParts } from "@/jobs/output";
import {
  DEFAULT_ENCODING_ID,
  ENCODING_PRESETS,
  getAvailableEncodingPresets,
  getEncodingPreset,
  type EncodingPreset,
  type EncodingId
} from "@/jobs/encoding";
import { pathExists } from "@/system/pathExists";

export type ExportSettings = OutputPathParts;

type ExportModalProps = {
  isOpen: boolean;
  settings: ExportSettings;
  inputPath?: string;
  onChange: (next: ExportSettings) => void;
  onClose: () => void;
  onConfirm: (outputPath: string, encodingId: EncodingId) => void;
};

// Export settings modal used before running a render job.
const ExportModal = ({
  isOpen,
  settings,
  inputPath,
  onChange,
  onClose,
  onConfirm
}: ExportModalProps) => {
  const shouldCloseRef = useRef(false);
  const [availablePresets, setAvailablePresets] =
    useState<EncodingPreset[]>(ENCODING_PRESETS);
  const [overwritePromptPath, setOverwritePromptPath] = useState<string | null>(null);
  const [missingFolderPath, setMissingFolderPath] = useState<string | null>(null);
  const [isCheckingOverwrite, setIsCheckingOverwrite] = useState(false);

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
    getAvailableEncodingPresets()
      .then((presets) => {
        if (!isActive) {
          return;
        }
        setAvailablePresets(presets);
        if (!presets.some((preset) => preset.id === settings.encodingId)) {
          onChange({ ...settings, encodingId: DEFAULT_ENCODING_ID });
        }
      })
      .catch(() => {
        if (isActive) {
          setAvailablePresets(ENCODING_PRESETS);
        }
      });
    return () => {
      isActive = false;
    };
  }, [isOpen, settings.encodingId, onChange, settings]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setOverwritePromptPath(null);
    setMissingFolderPath(null);
  }, [isOpen, inputPath, settings.folder, settings.fileName, settings.separator]);

  if (!isOpen) {
    return null;
  }

  const outputPath = joinOutputPath(
    settings.folder,
    settings.fileName,
    settings.separator
  );
  const folderPath = settings.folder.trim();
  const isValid = settings.fileName.trim().length > 0;
  const outputMatchesInput =
    !!inputPath && !!outputPath && pathsMatch(inputPath, outputPath);
  const encodingPreset = getEncodingPreset(settings.encodingId);
  const missingFolderWarning =
    missingFolderPath === ""
      ? "Output folder is required. Choose a destination folder."
      : missingFolderPath === folderPath
        ? "Output folder does not exist. Choose an existing folder."
        : null;

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
      onConfirm(outputPath, settings.encodingId);
      return;
    }

    setIsCheckingOverwrite(true);
    // Verify destination folder exists before checking for overwrite.
    if (!folderPath) {
      setMissingFolderPath("");
      setIsCheckingOverwrite(false);
      return;
    }
    const folderExists = await pathExists(folderPath);
    if (!folderExists) {
      setMissingFolderPath(folderPath);
      setIsCheckingOverwrite(false);
      return;
    }
    if (missingFolderPath) {
      setMissingFolderPath(null);
    }

    const exists = await pathExists(outputPath);
    setIsCheckingOverwrite(false);

    if (exists) {
      setOverwritePromptPath(outputPath);
      return;
    }

    onConfirm(outputPath, settings.encodingId);
  };

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
        <h2 id="export-modal-title" className="modal-title">
          Export settings
        </h2>
        <div className="export-form">
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
          <label className="export-field">
            <span className="export-label">Encoding</span>
            <select
              className="export-input export-select"
              value={settings.encodingId}
              onChange={(event) =>
                onChange({
                  ...settings,
                  encodingId: event.target.value as EncodingId
                })
              }
            >
              {availablePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <p className="export-help">
              {encodingPreset.description} {encodingPreset.notes}
            </p>
          </label>
          <p className="export-path" title={outputPath}>
            {outputPath || "Output path will appear here."}
          </p>
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
        </div>
        <div className="export-actions">
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
    </div>,
    document.body
  );
};

export default ExportModal;
