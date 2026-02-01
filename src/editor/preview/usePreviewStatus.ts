// Preview-frame toggle + status flags for the preview surface.
import { useCallback } from "react";
import type { RefObject } from "react";
import type { FramePreviewControl } from "@/editor/useFramePreview";
import { capturePreviewFrame } from "@/editor/preview/capturePreviewFrame";

type UsePreviewStatusArgs = {
  preview?: FramePreviewControl;
  isPlaying: boolean;
  isReady: boolean;
  error: string | null;
  currentTime: number;
  videoRef: RefObject<HTMLVideoElement | null>;
};

type UsePreviewStatusResult = {
  isPreviewEnabled: boolean;
  showPreviewToggle: boolean;
  showPreviewFrame: boolean;
  showPreviewStatus: boolean;
  isPreviewActive: boolean;
  previewLabel: string;
  previewDisabled: boolean;
  controlsDisabled: boolean;
  handlePreviewToggle: () => void;
};

const usePreviewStatus = ({
  preview,
  isPlaying,
  isReady,
  error,
  currentTime,
  videoRef
}: UsePreviewStatusArgs): UsePreviewStatusResult => {
  const isPreviewEnabled = !!preview?.isEnabled;
  const isPreviewActive = !!preview?.isActive;
  const previewDisabled = !!preview?.isProcessing || !!preview?.isLoading;
  const controlsDisabled = !!preview?.isProcessing || !!error;
  const showPreviewToggle = isPreviewEnabled && !isPlaying && isReady && !error;
  const showPreviewFrame = isPreviewActive && (!isPlaying || !!preview?.isProcessing);
  const showPreviewStatus = isPreviewEnabled && (!isPlaying || !!preview?.isProcessing);
  const previewLabel = preview?.label ?? "Preview frame";

  const handlePreviewToggle = useCallback(() => {
    if (!preview || previewDisabled) {
      return;
    }
    if (preview.isActive && !preview.isProcessing) {
      preview.onClear();
      return;
    }
    const video = videoRef.current;
    const frame = video
      ? capturePreviewFrame(video)
      : Promise.reject(new Error("Preview video is not ready."));
    preview.onRequest({ timeSeconds: currentTime, frame });
  }, [currentTime, preview, previewDisabled, videoRef]);

  return {
    isPreviewEnabled,
    showPreviewToggle,
    showPreviewFrame,
    showPreviewStatus,
    isPreviewActive,
    previewLabel,
    previewDisabled,
    controlsDisabled,
    handlePreviewToggle
  };
};

export default usePreviewStatus;
