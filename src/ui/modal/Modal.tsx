import { useEffect, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose: () => void;
};

// Simple modal dialog rendered via a portal.
const Modal = ({
  isOpen,
  title,
  message,
  confirmLabel = "Close",
  cancelLabel,
  onConfirm,
  onCancel,
  onClose
}: ModalProps) => {
  const shouldCloseRef = useRef(false);
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
      return;
    }
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    onClose();
  };

  const handleDismiss = () => {
    if (cancelLabel) {
      handleCancel();
    } else {
      handleConfirm();
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelLabel, isOpen, onClose, onCancel, onConfirm]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    shouldCloseRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const shouldClose =
      shouldCloseRef.current && event.target === event.currentTarget;
    shouldCloseRef.current = false;
    if (shouldClose) {
      handleDismiss();
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
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-body"
        onMouseDown={() => {
          shouldCloseRef.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>
        <p id="modal-body" className="modal-body scrollable">
          {message}
        </p>
        <div className="modal-actions">
          {cancelLabel ? (
            <button className="modal-button" type="button" onClick={handleCancel}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            className="modal-button modal-button--primary"
            type="button"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
