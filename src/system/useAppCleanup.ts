import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cleanupAllJobs } from "@/jobs/jobCleanup";
import { cleanupAllPreviewFiles } from "@/system/previewFiles";
import makeDebug from "@/utils/debug";

type ShutdownState = {
  isClosing: boolean;
  message: string;
};

const CLOSE_TIMEOUT_MS = 4000;

// App-wide cleanup for preview artifacts when the window closes.
const debug = makeDebug("system:app-cleanup");

const useAppCleanup = () => {
  const [shutdown, setShutdown] = useState<ShutdownState>({
    isClosing: false,
    message: ""
  });
  const allowCloseRef = useRef(false);
  const isClosingRef = useRef(false);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const setShutdownState = useCallback((next: ShutdownState) => {
    if (!isMountedRef.current) {
      return;
    }
    setShutdown(next);
  }, []);

  const forceClose = useCallback(async () => {
    allowCloseRef.current = true;
    try {
      await getCurrentWindow().close();
    } catch (error) {
      debug("force close failed: %O", error);
    }
  }, []);

  const runCleanup = useCallback(async () => {
    if (cleanupPromiseRef.current) {
      return cleanupPromiseRef.current;
    }
    const cleanup = Promise.all([
      cleanupAllPreviewFiles("app close"),
      cleanupAllJobs()
    ]).then(() => undefined);
    cleanupPromiseRef.current = cleanup;
    return cleanup;
  }, []);

  const startShutdown = useCallback(async () => {
    if (isClosingRef.current) {
      return;
    }
    isClosingRef.current = true;
    setShutdownState({
      isClosing: true,
      message:
        "Cleaning up temporary files before exit. You can quit immediately if needed."
    });

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      debug("cleanup timeout, forcing close");
      void forceClose();
    }, CLOSE_TIMEOUT_MS);

    try {
      await runCleanup();
    } catch (error) {
      debug("cleanup failed: %O", error);
    } finally {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    }

    await forceClose();
  }, [forceClose, runCleanup, setShutdownState]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const attach = async () => {
      try {
        unlisten = await appWindow.onCloseRequested(async (event) => {
          if (allowCloseRef.current) {
            return;
          }
          event.preventDefault();
          if (isClosingRef.current) {
            return;
          }
          void startShutdown();
        });
      } catch (error) {
        debug("close handler failed: %O", error);
      }
    };

    void attach();

    return () => {
      isMountedRef.current = false;
      if (unlisten) {
        unlisten();
      }
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
      if (!isClosingRef.current) {
        void cleanupAllPreviewFiles("app unmount");
        void cleanupAllJobs();
      }
    };
  }, [startShutdown]);

  return {
    isClosing: shutdown.isClosing,
    message: shutdown.message,
    forceClose
  };
};

export default useAppCleanup;
