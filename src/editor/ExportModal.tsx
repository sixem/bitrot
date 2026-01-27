import { useEffect } from "react";
import { createPortal } from "react-dom";
import { joinOutputPath, type OutputPathParts } from "@/jobs/output";

export type ExportSettings = OutputPathParts;

type ExportModalProps = {
  isOpen: boolean;
  settings: ExportSettings;
  onChange: (next: ExportSettings) => void;
  onClose: () => void;
  onConfirm: (outputPath: string) => void;
};

// Export settings modal used before running a render job.
const ExportModal = ({ isOpen, settings, onChange, onClose, onConfirm }: ExportModalProps) => {
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

  if (!isOpen) {
    return null;
  }

  const outputPath = joinOutputPath(
    settings.folder,
    settings.fileName,
    settings.separator
  );
  const isValid = settings.fileName.trim().length > 0;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
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
            onClick={() => onConfirm(outputPath)}
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
