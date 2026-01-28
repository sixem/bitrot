import { useEffect, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
};

// Simple modal dialog rendered via a portal.
const Modal = ({
  isOpen,
  title,
  message,
  confirmLabel = "Close",
  onClose
}: ModalProps) => {
  const shouldCloseRef = useRef(false);

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
        <p id="modal-body" className="modal-body">
          {message}
        </p>
        <div className="modal-actions">
          <button className="modal-button" type="button" onClick={onClose}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
