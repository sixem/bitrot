import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cleanupPreviewFile, registerPreviewFile } from "@/system/previewFiles";
import { buildPreviewUrl } from "@/editor/preview/previewUrl";
import usePreviewState from "@/editor/preview/usePreviewState";
import type { ModePreview } from "@/modes/definitions";
import makeDebug from "@/utils/debug";

type NativePreviewPayload = {
  jobId: string;
  frame: number;
  path: string;
};

type LivePreviewOptions = {
  previewMode?: ModePreview;
  jobId?: string;
  isProcessing: boolean;
};

const debug = makeDebug("preview:frame");
const appWindow = getCurrentWindow();

const PREVIEW_EVENT_NAMES: Record<ModePreview, string> = {
  pixelsort: "pixelsort-preview",
  "modulo-mapping": "modulo-mapping-preview",
  "block-shift": "block-shift-preview",
  vaporwave: "vaporwave-preview"
};

// Handles event wiring + cleanup for live preview updates during processing.
const useLivePreviewListener = ({
  previewMode,
  jobId,
  isProcessing
}: LivePreviewOptions) => {
  const { state, setSuccess, clear } = usePreviewState();
  const livePreviewPathRef = useRef<string | null>(null);

  const clearLivePreview = useCallback(
    (reason: string) => {
      const previousPath = livePreviewPathRef.current;
      if (previousPath) {
        livePreviewPathRef.current = null;
        void cleanupPreviewFile(previousPath, reason);
      }
      clear();
    },
    [clear]
  );

  useEffect(() => {
    if (!previewMode || !isProcessing) {
      clearLivePreview("preview stopped");
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    // Listen on the current window because Rust emits preview events window-scoped.
    const eventName = PREVIEW_EVENT_NAMES[previewMode];
    appWindow
      .listen<NativePreviewPayload>(eventName, (event) => {
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
        setSuccess(buildPreviewUrl(nextPath), event.payload.frame);
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
  }, [clearLivePreview, isProcessing, jobId, previewMode, setSuccess]);

  useEffect(() => () => clearLivePreview("preview unmount"), [clearLivePreview]);

  return {
    livePreview: state,
    clearLivePreview
  };
};

export default useLivePreviewListener;
