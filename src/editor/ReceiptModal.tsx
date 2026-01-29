import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { revealInFolder } from "@/system/reveal";
import { splitOutputPath } from "@/jobs/output";
import { getEncodingPreset, type EncodingId } from "@/jobs/encoding";
import { getModeDefinition, type ModeId } from "@/modes/definitions";
import formatBytes from "@/utils/formatBytes";
import makeDebug from "@/utils/debug";

type ReceiptModalProps = {
  isOpen: boolean;
  outputPath: string;
  inputSizeBytes?: number;
  modeId: ModeId;
  encodingId: EncodingId;
  onClose: () => void;
};

const debug = makeDebug("receipt");

// Post-export receipt modal with quick OS actions.
const ReceiptModal = ({
  isOpen,
  outputPath,
  inputSizeBytes,
  modeId,
  encodingId,
  onClose
}: ReceiptModalProps) => {
  const shouldCloseRef = useRef(false);
  const [status, setStatus] = useState<string | null>(null);
  const [outputSizeBytes, setOutputSizeBytes] = useState<number | null>(null);

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

  useEffect(() => {
    if (!isOpen) {
      setOutputSizeBytes(null);
      return;
    }
    const trimmed = outputPath.trim();
    if (!trimmed) {
      setOutputSizeBytes(null);
      return;
    }
    let isActive = true;
    setOutputSizeBytes(null);
    invoke<number>("file_size", { path: trimmed })
      .then((size) => {
        if (isActive) {
          setOutputSizeBytes(size);
        }
      })
      .catch((error) => {
        debug("file size lookup failed: %O", error);
        if (isActive) {
          setOutputSizeBytes(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, [isOpen, outputPath]);

  if (!isOpen) {
    return null;
  }

  const outputParts = splitOutputPath(outputPath);
  const folderPath = outputParts.folder;
  const hasOutput = outputPath.trim().length > 0;
  const canCopy = typeof navigator?.clipboard?.writeText === "function";
  const mode = getModeDefinition(modeId);
  const encoding = getEncodingPreset(encodingId);
  const hasInputSize =
    typeof inputSizeBytes === "number" && Number.isFinite(inputSizeBytes);
  const hasOutputSize =
    typeof outputSizeBytes === "number" && Number.isFinite(outputSizeBytes);
  const outputSizeLabel = hasOutputSize ? formatBytes(outputSizeBytes) : "--";
  const changePercent =
    hasInputSize && hasOutputSize && inputSizeBytes > 0
      ? ((outputSizeBytes - inputSizeBytes) / inputSizeBytes) * 100
      : null;
  const changeLabel =
    changePercent === null
      ? "--"
      : `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%`;

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
          <div className="editor-kv-row">
            <span className="editor-kv-label">Size</span>
            <span className="editor-kv-value">{outputSizeLabel}</span>
          </div>
          <div className="editor-kv-row">
            <span className="editor-kv-label">Change</span>
            <span className="editor-kv-value">{changeLabel}</span>
          </div>
        </div>
        {status && <p className="receipt-status">{status}</p>}
        <div className="receipt-actions">
          <div className="receipt-actions-row">
            <button
              className="modal-button modal-button--primary"
              type="button"
              onClick={handleOpenFile}
              disabled={!hasOutput}
            >
              Open file
            </button>
            <button
              className="modal-button"
              type="button"
              onClick={handleReveal}
              disabled={!hasOutput || !folderPath}
            >
              Show folder
            </button>
            <button
              className="modal-button"
              type="button"
              onClick={handleCopy}
              disabled={!hasOutput}
            >
              Copy path
            </button>
          </div>
          <button
            className="modal-button receipt-close-button"
            type="button"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReceiptModal;
