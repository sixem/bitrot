import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VideoAsset } from "@/domain/video";
import type { VideoMetadata } from "@/system/ffprobe";
import type { FramePreviewRequest } from "@/editor/preview/types";
import { sendPixelsortPreviewFrame } from "@/editor/preview/sendPixelsortPreviewFrame";
import { sendModuloMappingPreviewFrame } from "@/editor/preview/sendByteRangePreviewFrame";
import { sendBlockShiftPreviewFrame } from "@/editor/preview/sendBlockShiftPreviewFrame";
import { sendVaporwavePreviewFrame } from "@/editor/preview/sendVaporwavePreviewFrame";
import { buildPreviewUrl } from "@/editor/preview/previewUrl";
import useLivePreviewListener from "@/editor/preview/useLivePreviewListener";
import usePreviewState from "@/editor/preview/usePreviewState";
import {
  getModeDefinition,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import type { PixelsortConfig } from "@/modes/pixelsort";
import type { ModuloMappingConfig } from "@/modes/moduloMapping";
import type { BlockShiftConfig } from "@/modes/blockShift";
import type { VaporwaveConfig } from "@/modes/vaporwave";
import { cleanupPreviewFile, registerPreviewFile } from "@/system/previewFiles";
import makeDebug from "@/utils/debug";

type FramePreviewOptions = {
  asset: VideoAsset;
  modeId: ModeId;
  modeConfig: ModeConfigMap[ModeId];
  metadata?: VideoMetadata;
  // Used to scope live preview events to the active native job.
  jobId?: string;
  isProcessing: boolean;
};

export type FramePreviewControl = {
  isEnabled: boolean;
  isActive: boolean;
  isLoading: boolean;
  isProcessing: boolean;
  label: string;
  previewUrl?: string;
  error?: string;
  onRequest: (request: FramePreviewRequest) => void;
  onClear: () => void;
};

const debug = makeDebug("preview:frame");

// Hook that owns on-demand and live preview frames for native preview modes.

// Wraps a promise with a timeout so preview capture can fail gracefully.
const awaitWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`Preview capture timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

// Manages frame preview state for native modes (pixelsort + modulo mapping + block shift).
const useFramePreview = ({
  asset,
  modeId,
  modeConfig,
  metadata,
  jobId,
  isProcessing
}: FramePreviewOptions): FramePreviewControl => {
  const previewMode = getModeDefinition(modeId).preview;
  const isSupported = previewMode !== undefined;
  const {
    state: manualPreview,
    startLoading: startManualLoading,
    setError: setManualError,
    setSuccess: setManualSuccess,
    clear: clearManualState
  } = usePreviewState();
  const { livePreview, clearLivePreview } = useLivePreviewListener({
    previewMode,
    jobId,
    isProcessing
  });
  // Track on-disk preview artifacts so they can be cleaned up when replaced.
  const manualPreviewPathRef = useRef<string | null>(null);
  // Monotonic request id to ignore stale async preview responses.
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const clearManualPreview = useCallback((reason: string) => {
    requestIdRef.current += 1;
    const previousPath = manualPreviewPathRef.current;
    if (previousPath) {
      manualPreviewPathRef.current = null;
      void cleanupPreviewFile(previousPath, reason);
    }
    clearManualState();
  }, [clearManualState]);

  useEffect(() => {
    // React 18 StrictMode mounts/unmounts effects twice in dev; reset the flag on mount.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const manualPath = manualPreviewPathRef.current;
      if (manualPath) {
        manualPreviewPathRef.current = null;
        void cleanupPreviewFile(manualPath, "preview unmount");
      }
    };
  }, []);

  useEffect(() => {
    clearManualPreview("preview reset");
    clearLivePreview("preview reset");
  }, [asset.path, modeId, clearLivePreview, clearManualPreview]);

  useEffect(() => {
    if (!isSupported) {
      clearManualPreview("preview unsupported");
      return;
    }
    // Reset manual previews when the config changes to avoid mismatched frames.
    clearManualPreview("preview config change");
  }, [isSupported, modeConfig, clearManualPreview]);

  const requestPreview = useCallback(
    async (request: FramePreviewRequest) => {
      if (!isSupported || !previewMode) {
        setManualError("Preview is not available for this mode.", {
          preservePreview: false
        });
        return;
      }

      startManualLoading();

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      let payload;
      try {
        payload = await awaitWithTimeout(request.frame, 2000);
      } catch (error) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Preview capture failed.";
        debug("preview capture failed: %O", error);
        setManualError(message);
        return;
      }

      if (!payload) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        setManualError("Preview capture failed.");
        return;
      }

      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const { width, height, data } = payload;
      if (!width || !height || data.length === 0) {
        setManualError("Preview buffer is empty.");
        return;
      }
      const expected = width * height * 4;
      if (!Number.isFinite(expected) || data.length !== expected) {
        setManualError("Preview buffer size mismatch.");
        return;
      }

      try {
        const isStale = () =>
          !isMountedRef.current || requestId !== requestIdRef.current;
        let responsePath: string;
        if (previewMode === "pixelsort") {
          responsePath = await sendPixelsortPreviewFrame(
            { width, height, data },
            modeConfig as PixelsortConfig,
            { shouldAbort: isStale }
          );
        } else if (previewMode === "modulo-mapping") {
          responsePath = await sendModuloMappingPreviewFrame(
            { width, height, data },
            modeConfig as ModuloMappingConfig,
            { shouldAbort: isStale }
          );
        } else if (previewMode === "block-shift") {
          responsePath = await sendBlockShiftPreviewFrame(
            { width, height, data },
            modeConfig as BlockShiftConfig,
            { shouldAbort: isStale }
          );
        } else if (previewMode === "vaporwave") {
          responsePath = await sendVaporwavePreviewFrame(
            { width, height, data },
            modeConfig as VaporwaveConfig,
            { shouldAbort: isStale }
          );
        } else {
          throw new Error("Preview is not available for this mode.");
        }

        if (isStale()) {
          void cleanupPreviewFile(responsePath, "preview stale");
          return;
        }

        registerPreviewFile(responsePath);
        const previousPath = manualPreviewPathRef.current;
        manualPreviewPathRef.current = responsePath;
        if (previousPath && previousPath !== responsePath) {
          void cleanupPreviewFile(previousPath, "preview replaced");
        }

        const clampedTime = Number.isFinite(request.timeSeconds)
          ? Math.max(0, request.timeSeconds)
          : 0;
        const boundedTime =
          typeof metadata?.durationSeconds === "number" &&
          Number.isFinite(metadata.durationSeconds)
            ? Math.min(clampedTime, metadata.durationSeconds)
            : clampedTime;
        const frame =
          typeof metadata?.fps === "number" && Number.isFinite(metadata.fps)
            ? Math.max(0, Math.round(boundedTime * metadata.fps))
            : undefined;

        setManualSuccess(buildPreviewUrl(responsePath), frame);
      } catch (error) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Preview render failed.";
        debug("preview failed: %O", error);
        setManualError(message);
      }
    },
    [
      isSupported,
      metadata?.durationSeconds,
      metadata?.fps,
      modeConfig,
      previewMode,
      setManualError,
      setManualSuccess,
      startManualLoading
    ]
  );

  const clearPreview = useCallback(() => {
    clearManualPreview("preview cleared");
  }, [clearManualPreview]);

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
