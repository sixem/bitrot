import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { VideoAsset } from "@/domain/video";
import type { VideoMetadata } from "@/system/ffprobe";
import type { FramePreviewRequest } from "@/editor/preview/types";
import { sendPixelsortPreviewFrame } from "@/editor/preview/sendPixelsortPreviewFrame";
import { getModeDefinition, type ModeConfigMap, type ModeId } from "@/modes/definitions";
import type { PixelsortConfig } from "@/modes/pixelsort";
import { cleanupPreviewFile, registerPreviewFile } from "@/system/previewFiles";
import makeDebug from "@/utils/debug";

type FramePreviewOptions = {
  asset: VideoAsset;
  modeId: ModeId;
  modeConfig: ModeConfigMap[ModeId];
  metadata?: VideoMetadata;
  // Used to scope live preview events to the active pixelsort job.
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

type PreviewState = {
  isActive: boolean;
  isLoading: boolean;
  previewUrl?: string;
  frame?: number;
  error?: string;
};

type PixelsortPreviewPayload = {
  jobId: string;
  frame: number;
  path: string;
};

const debug = makeDebug("preview:frame");
const appWindow = getCurrentWindow();

// Hook that owns on-demand and live preview frames for native preview modes.

const supportsPixelsortPreview = (modeId: ModeId) =>
  getModeDefinition(modeId).preview === "pixelsort";

const buildPreviewUrl = (path: string) =>
  `${convertFileSrc(path)}?v=${Date.now()}`;

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

// Manages frame preview state for non-ffmpeg modes (currently pixelsort).
const useFramePreview = ({
  asset,
  modeId,
  modeConfig,
  metadata,
  jobId,
  isProcessing
}: FramePreviewOptions): FramePreviewControl => {
  const isSupported = supportsPixelsortPreview(modeId);
  const [manualPreview, setManualPreview] = useState<PreviewState>({
    isActive: false,
    isLoading: false
  });
  const [livePreview, setLivePreview] = useState<PreviewState>({
    isActive: false,
    isLoading: false
  });
  // Track on-disk preview artifacts so they can be cleaned up when replaced.
  const manualPreviewPathRef = useRef<string | null>(null);
  const livePreviewPathRef = useRef<string | null>(null);
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
    setManualPreview({ isActive: false, isLoading: false });
  }, []);

  const clearLivePreview = useCallback((reason: string) => {
    const previousPath = livePreviewPathRef.current;
    if (previousPath) {
      livePreviewPathRef.current = null;
      void cleanupPreviewFile(previousPath, reason);
    }
    setLivePreview({ isActive: false, isLoading: false });
  }, []);

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
      const livePath = livePreviewPathRef.current;
      if (livePath) {
        livePreviewPathRef.current = null;
        void cleanupPreviewFile(livePath, "preview unmount");
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

  useEffect(() => {
    if (!isSupported || !isProcessing) {
      clearLivePreview("preview stopped");
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    // Listen on the current window because Rust emits preview events window-scoped.
    appWindow.listen<PixelsortPreviewPayload>("pixelsort-preview", (event) => {
      if (!isMounted) {
        return;
      }
      if (!jobId || event.payload.jobId !== jobId) {
        return;
      }
      const nextPath = event.payload.path;
      registerPreviewFile(nextPath);
      const previousPath = livePreviewPathRef.current;
      livePreviewPathRef.current = nextPath;
      if (previousPath && previousPath !== nextPath) {
        void cleanupPreviewFile(previousPath, "live preview replaced");
      }
      setLivePreview({
        isActive: true,
        isLoading: false,
        previewUrl: buildPreviewUrl(nextPath),
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
  }, [clearLivePreview, isProcessing, isSupported, jobId]);

  const requestPreview = useCallback(
    async (request: FramePreviewRequest) => {
      if (!isSupported) {
        setManualPreview({
          isActive: true,
          isLoading: false,
          error: "Preview is not available for this mode."
        });
        return;
      }

      setManualPreview((prev) => ({
        ...prev,
        isActive: true,
        isLoading: true,
        error: undefined
      }));

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
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: message
        }));
        return;
      }

      if (!payload) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: "Preview capture failed."
        }));
        return;
      }

      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const { width, height, data } = payload;
      if (!width || !height || data.length === 0) {
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: "Preview buffer is empty."
        }));
        return;
      }
      const expected = width * height * 4;
      if (!Number.isFinite(expected) || data.length !== expected) {
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: "Preview buffer size mismatch."
        }));
        return;
      }

      try {
        const isStale = () =>
          !isMountedRef.current || requestId !== requestIdRef.current;
        const responsePath = await sendPixelsortPreviewFrame(
          { width, height, data },
          modeConfig as PixelsortConfig,
          { shouldAbort: isStale }
        );

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

        setManualPreview({
          isActive: true,
          isLoading: false,
          previewUrl: buildPreviewUrl(responsePath),
          frame
        });
      } catch (error) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Preview render failed.";
        debug("preview failed: %O", error);
        setManualPreview((prev) => ({
          ...prev,
          isActive: true,
          isLoading: false,
          error: message
        }));
      }
    },
    [isSupported, metadata?.durationSeconds, metadata?.fps, modeConfig]
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
