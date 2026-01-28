import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { VideoAsset } from "@/domain/video";
import type { VideoMetadata } from "@/system/ffprobe";
import type { TrimSelectionState } from "@/editor/useTrimSelection";
import type { ModeConfigMap, ModeId } from "@/modes/definitions";
import type { PixelsortConfig } from "@/modes/pixelsort";
import makeDebug from "@/utils/debug";

type FramePreviewOptions = {
  asset: VideoAsset;
  modeId: ModeId;
  modeConfig: ModeConfigMap[ModeId];
  metadata?: VideoMetadata;
  isProcessing: boolean;
  trim?: TrimSelectionState;
};

export type FramePreviewControl = {
  isEnabled: boolean;
  isActive: boolean;
  isLoading: boolean;
  isProcessing: boolean;
  label: string;
  previewUrl?: string;
  error?: string;
  onRequest: (timeSeconds: number) => void;
  onClear: () => void;
};

type PreviewState = {
  isActive: boolean;
  isLoading: boolean;
  previewUrl?: string;
  frame?: number;
  error?: string;
};

type PixelsortPreviewPayload = {
  frame: number;
  path: string;
};

type PixelsortPreviewResponse = {
  path: string;
};

const debug = makeDebug("preview:frame");

// Hook that owns on-demand and live preview frames for non-ffmpeg modes.

const isPixelsortMode = (modeId: ModeId): modeId is "pixelsort" =>
  modeId === "pixelsort";

const buildPreviewUrl = (path: string) =>
  `${convertFileSrc(path)}?v=${Date.now()}`;

// Manages frame preview state for non-ffmpeg modes (currently pixelsort).
const useFramePreview = ({
  asset,
  modeId,
  modeConfig,
  metadata,
  isProcessing,
  trim
}: FramePreviewOptions): FramePreviewControl => {
  const isSupported = isPixelsortMode(modeId);
  const [manualPreview, setManualPreview] = useState<PreviewState>({
    isActive: false,
    isLoading: false
  });
  const [livePreview, setLivePreview] = useState<PreviewState>({
    isActive: false,
    isLoading: false
  });

  useEffect(() => {
    setManualPreview({ isActive: false, isLoading: false });
    setLivePreview({ isActive: false, isLoading: false });
  }, [asset.path, modeId]);

  useEffect(() => {
    if (!isSupported) {
      return;
    }
    setManualPreview((prev) =>
      prev.isActive ? { isActive: false, isLoading: false } : prev
    );
  }, [isSupported, modeConfig]);

  useEffect(() => {
    if (!isSupported || !isProcessing) {
      setLivePreview({ isActive: false, isLoading: false });
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    listen<PixelsortPreviewPayload>("pixelsort-preview", (event) => {
      if (!isMounted) {
        return;
      }
      setLivePreview({
        isActive: true,
        isLoading: false,
        previewUrl: buildPreviewUrl(event.payload.path),
        frame: event.payload.frame
      });
    })
      .then((stop) => {
        if (!isMounted) {
          stop();
          return;
        }
        unlisten = stop;
      })
      .catch((error) => {
        debug("preview listen failed: %O", error);
      });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [isProcessing, isSupported]);

  const requestPreview = useCallback(
    async (timeSeconds: number) => {
      if (!isSupported || !asset.path || !metadata) {
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: "Preview requires loaded metadata."
        }));
        return;
      }
      if (!metadata.width || !metadata.height) {
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: "Preview requires video dimensions."
        }));
        return;
      }

      setManualPreview((prev) => ({
        ...prev,
        isActive: true,
        isLoading: true,
        error: undefined
      }));

      const clampedTime = Number.isFinite(metadata.durationSeconds)
        ? Math.min(Math.max(0, timeSeconds), metadata.durationSeconds ?? timeSeconds)
        : Math.max(0, timeSeconds);
      const durationSeconds = metadata.durationSeconds;
      const fps = metadata.fps;
      const epsilon =
        typeof fps === "number" && Number.isFinite(fps) && fps > 0
          ? 1 / fps
          : 0.033;
      const safeTime =
        typeof durationSeconds === "number" &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
          ? Math.min(clampedTime, Math.max(0, durationSeconds - epsilon))
          : clampedTime;
      const trimActive =
        !!trim?.enabled &&
        !!trim.isValid &&
        typeof trim.start === "number" &&
        typeof trim.end === "number";
      const trimmedTime = trimActive
        ? Math.min(
            Math.max(safeTime, trim.start),
            Math.max(trim.start, trim.end - epsilon)
          )
        : safeTime;

      try {
        const response = await invoke<PixelsortPreviewResponse>("pixelsort_preview", {
          inputPath: asset.path,
          timeSeconds: trimmedTime,
          width: metadata.width,
          height: metadata.height,
          config: modeConfig as PixelsortConfig
        });

        const frame =
          typeof metadata.fps === "number" && Number.isFinite(metadata.fps)
            ? Math.max(0, Math.round(trimmedTime * metadata.fps))
            : undefined;

        setManualPreview({
          isActive: true,
          isLoading: false,
          previewUrl: buildPreviewUrl(response.path),
          frame
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Preview render failed.";
        debug("preview failed: %O", error);
        setManualPreview({
          isActive: true,
          isLoading: false,
          error: message
        });
      }
    },
    [asset.path, isSupported, metadata, modeConfig, trim]
  );

  const clearPreview = useCallback(() => {
    setManualPreview({ isActive: false, isLoading: false });
  }, []);

  const previewState = isProcessing ? livePreview : manualPreview;
  const frameLabel =
    previewState.frame !== undefined
      ? `Previewing frame ${previewState.frame}`
      : null;
  const label = isProcessing
    ? frameLabel ?? "Previewing frame..."
    : manualPreview.isActive
      ? "Show original"
      : "Preview frame";
  const isLoading = previewState.isLoading;

  return useMemo(
    () => ({
      isEnabled: isSupported,
      isActive: isSupported && (isProcessing || manualPreview.isActive),
      isLoading: isSupported && isLoading,
      isProcessing,
      label,
      previewUrl: isSupported ? previewState.previewUrl : undefined,
      error: isSupported ? previewState.error : undefined,
      onRequest: requestPreview,
      onClear: clearPreview
    }),
    [
      clearPreview,
      isLoading,
      isProcessing,
      isSupported,
      label,
      manualPreview.isActive,
      previewState.error,
      previewState.previewUrl,
      requestPreview
    ]
  );
};

export default useFramePreview;
