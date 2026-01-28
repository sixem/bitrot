import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { joinOutputPath, type OutputPathParts } from "@/jobs/output";
import {
  DEFAULT_ENCODING_ID,
  ENCODING_PRESETS,
  getAvailableEncodingPresets,
  getEncodingPreset,
  type EncodingPreset,
  type EncodingId
} from "@/jobs/encoding";

export type ExportSettings = OutputPathParts;

type ExportModalProps = {
  isOpen: boolean;
  settings: ExportSettings;
  onChange: (next: ExportSettings) => void;
  onClose: () => void;
  onConfirm: (outputPath: string, encodingId: EncodingId) => void;
};

// Export settings modal used before running a render job.
const ExportModal = ({ isOpen, settings, onChange, onClose, onConfirm }: ExportModalProps) => {
  const shouldCloseRef = useRef(false);
  const [availablePresets, setAvailablePresets] =
    useState<EncodingPreset[]>(ENCODING_PRESETS);

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

  if (!isOpen) {
    return null;
  }

  const outputPath = joinOutputPath(
    settings.folder,
    settings.fileName,
    settings.separator
  );
  const isValid = settings.fileName.trim().length > 0;
  const encodingPreset = getEncodingPreset(settings.encodingId);

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
        </div>
        <div className="export-actions">
          <button className="modal-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-button modal-button--primary"
            type="button"
            onClick={() => onConfirm(outputPath, settings.encodingId)}
            disabled={!isValid}
          >
            Export
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExportModal;
