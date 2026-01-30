import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FrameMap } from "@/analysis/frameMap";
import type { VideoAsset } from "@/domain/video";
import type { VideoMetadata } from "@/system/ffprobe";
import type { TrimSelectionState } from "@/editor/useTrimSelection";
import { getModeDefinition, type ModeConfigMap, type ModeId } from "@/modes/definitions";
import type { PixelsortConfig } from "@/modes/pixelsort";
import { cleanupPreviewFile, registerPreviewFile } from "@/system/previewFiles";
import makeDebug from "@/utils/debug";

type FramePreviewOptions = {
  asset: VideoAsset;
  modeId: ModeId;
  modeConfig: ModeConfigMap[ModeId];
  metadata?: VideoMetadata;
  frameMap?: FrameMap;
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
  previewPath?: string;
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

// Hook that owns on-demand and live preview frames for native preview modes.

const supportsPixelsortPreview = (modeId: ModeId) =>
  getModeDefinition(modeId).preview === "pixelsort";

const buildPreviewUrl = (path: string) =>
  `${convertFileSrc(path)}?v=${Date.now()}`;

// Finds the closest keyframe time at or before the requested time.
const findKeyframeAnchor = (keyframes: Float64Array, timeSeconds: number) => {
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
    return 0;
  }
  if (keyframes.length === 0) {
    return undefined;
  }
  if (timeSeconds <= keyframes[0]) {
    return keyframes[0];
  }

  let low = 0;
  let high = keyframes.length - 1;
  let best = keyframes[0];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = keyframes[mid];
    if (value <= timeSeconds) {
      best = value;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
};

// Manages frame preview state for non-ffmpeg modes (currently pixelsort).
const useFramePreview = ({
  asset,
  modeId,
  modeConfig,
  metadata,
  frameMap,
  isProcessing,
  trim
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
    if (manualPreview.isActive) {
      clearManualPreview("preview config change");
    }
  }, [isSupported, modeConfig, manualPreview.isActive, clearManualPreview]);

  useEffect(() => {
    if (!isSupported || !isProcessing) {
      clearLivePreview("preview stopped");
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    listen<PixelsortPreviewPayload>("pixelsort-preview", (event) => {
      if (!isMounted) {
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
        previewPath: nextPath,
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
  }, [clearLivePreview, isProcessing, isSupported]);

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
      const trimStart = trim?.start;
      const trimEnd = trim?.end;
      const trimActive =
        !!trim?.enabled &&
        !!trim.isValid &&
        typeof trimStart === "number" &&
        typeof trimEnd === "number";
      const trimmedTime = trimActive
        ? Math.min(
            Math.max(safeTime, trimStart),
            Math.max(trimStart, trimEnd - epsilon)
          )
        : safeTime;
      const keyframeSeconds = frameMap?.keyframeTimes
        ? findKeyframeAnchor(frameMap.keyframeTimes, trimmedTime)
        : undefined;

      try {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const response = await invoke<PixelsortPreviewResponse>("pixelsort_preview", {
          inputPath: asset.path,
          timeSeconds: trimmedTime,
          keyframeSeconds,
          width: metadata.width,
          height: metadata.height,
          config: modeConfig as PixelsortConfig
        });

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          void cleanupPreviewFile(response.path, "preview stale");
          return;
        }

        registerPreviewFile(response.path);
        const previousPath = manualPreviewPathRef.current;
        manualPreviewPathRef.current = response.path;
        if (previousPath && previousPath !== response.path) {
          void cleanupPreviewFile(previousPath, "preview replaced");
        }

        const frame =
          typeof metadata.fps === "number" && Number.isFinite(metadata.fps)
            ? Math.max(0, Math.round(trimmedTime * metadata.fps))
            : undefined;

        setManualPreview({
          isActive: true,
          isLoading: false,
          previewUrl: buildPreviewUrl(response.path),
          previewPath: response.path,
          frame
        });
      } catch (error) {
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
    [asset.path, frameMap?.keyframeTimes, isSupported, metadata, modeConfig, trim]
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
      : "Preview frame (estimate)";
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
