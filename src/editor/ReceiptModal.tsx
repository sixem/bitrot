import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-shell";
import { revealInFolder } from "@/system/reveal";
import { splitOutputPath } from "@/jobs/output";
import { getEncodingPreset, type EncodingId } from "@/jobs/encoding";
import { getModeDefinition, type ModeId } from "@/modes/definitions";
import makeDebug from "@/utils/debug";

type ReceiptModalProps = {
  isOpen: boolean;
  outputPath: string;
  modeId: ModeId;
  encodingId: EncodingId;
  onClose: () => void;
};

const debug = makeDebug("receipt");

// Post-export receipt modal with quick OS actions.
const ReceiptModal = ({
  isOpen,
  outputPath,
  modeId,
  encodingId,
  onClose
}: ReceiptModalProps) => {
  const shouldCloseRef = useRef(false);
  const [status, setStatus] = useState<string | null>(null);

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
      setStatus(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const outputParts = splitOutputPath(outputPath);
  const folderPath = outputParts.folder;
  const hasOutput = outputPath.trim().length > 0;
  const canCopy = typeof navigator?.clipboard?.writeText === "function";
  const mode = getModeDefinition(modeId);
  const encoding = getEncodingPreset(encodingId);

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

  const handleCopy = async () => {
    if (!canCopy) {
      setStatus("Clipboard is unavailable on this platform.");
      return;
    }
    try {
      await navigator.clipboard.writeText(outputPath);
      setStatus("Copied file path to clipboard.");
    } catch (error) {
      debug("clipboard failed: %O", error);
      setStatus("Unable to copy file path.");
    }
  };

  const handleOpenFile = async () => {
    try {
      await open(outputPath);
    } catch (error) {
      debug("open file failed: %O", error);
      setStatus("Unable to open the exported file.");
    }
  };

  const handleReveal = async () => {
    try {
      await revealInFolder(outputPath);
    } catch (error) {
      debug("reveal failed: %O", error);
      setStatus("Unable to reveal the exported file.");
    }
  };

  const title = "Export complete";

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="modal receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        onMouseDown={() => {
          shouldCloseRef.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="receipt-title" className="modal-title">
          {title}
        </h2>
        <div className="editor-kv receipt-kv">
          <div className="editor-kv-row">
            <span className="editor-kv-label">Output</span>
            <button
              className="editor-kv-value editor-kv-value--action"
              type="button"
              onClick={handleReveal}
              title={outputPath}
              disabled={!hasOutput}
            >
              {outputPath || "--"}
            </button>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Mode</span>
            <span className="editor-kv-value">{mode.label}</span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Encoding</span>
            <span className="editor-kv-value">{encoding.label}</span>
          </div>
        </div>
        {status && <p className="receipt-status">{status}</p>}
        <div className="receipt-actions">
          <button
            className="modal-button"
            type="button"
            onClick={handleCopy}
            disabled={!hasOutput}
          >
            Copy path
          </button>
          <button
            className="modal-button"
            type="button"
            onClick={handleReveal}
            disabled={!hasOutput || !folderPath}
          >
            Show in folder
          </button>
          <button
            className="modal-button modal-button--primary"
            type="button"
            onClick={handleOpenFile}
            disabled={!hasOutput}
          >
            Open file
          </button>
          <button className="modal-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReceiptModal;
