import { useState, type DragEvent, type KeyboardEvent } from "react";
import { isSupportedVideoPath, videoExtensionsLabel } from "@/domain/video";

type DropZoneProps = {
  // Called only when a video file is dropped.
  onVideoDrop?: (file: File) => void;
  // Called when the drop is not a supported video file.
  onInvalidDrop?: (message: string) => void;
  // Called when the user clicks the drop zone to pick a file.
  onPickFile?: () => void | Promise<void>;
  // Prevents any drag/drop interaction when true.
  isDisabled?: boolean;
};

// Lightweight drop target for the landing page.
const DropZone = ({
  onVideoDrop,
  onInvalidDrop,
  onPickFile,
  isDisabled
}: DropZoneProps) => {
  const [isActive, setIsActive] = useState(false);
  const isClickable = Boolean(onPickFile) && !isDisabled;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }
    if (!onVideoDrop) {
      return;
    }
    event.preventDefault();
  };

  const handleDragEnter = () => {
    if (isDisabled) {
      return;
    }
    if (!onVideoDrop) {
      return;
    }
    setIsActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }
    if (!onVideoDrop) {
      return;
    }
    // Ignore transitions between children so the indicator does not flicker.
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (isDisabled) {
      return;
    }
    if (!onVideoDrop) {
      return;
    }
    event.preventDefault();
    setIsActive(false);

    const file = event.dataTransfer.files?.item(0);
    if (!file) {
      return;
    }

    if (!isSupportedVideoPath(file.name)) {
      onInvalidDrop?.(
        `Please drop a video file (${videoExtensionsLabel()}).`
      );
      return;
    }

    onVideoDrop(file);
  };

  const handleClick = () => {
    if (!isClickable) {
      return;
    }
    void onPickFile?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isClickable) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    void onPickFile?.();
  };

  return (
    <div
      className="dropzone"
      data-active={isActive}
      data-disabled={isDisabled}
      data-clickable={isClickable}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="dropzone-inner">
        <p className="dropzone-title">Drop a video to corrupt</p>
        <p className="dropzone-subtitle">
          {isActive ? "Release to begin." : "MP4, MOV, MKV. etc."}
        </p>
      </div>
    </div>
  );
};

export default DropZone;
