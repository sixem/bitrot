import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cleanupAllPreviewFiles } from "@/system/previewFiles";
import makeDebug from "@/utils/debug";

// App-wide cleanup for preview artifacts when the window closes.
const debug = makeDebug("system:app-cleanup");

const useAppCleanup = () => {
  const isClosingRef = useRef(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const attach = async () => {
      try {
        unlisten = await appWindow.onCloseRequested(async (event) => {
          if (isClosingRef.current) {
            return;
          }
          isClosingRef.current = true;
          event.preventDefault();
          await cleanupAllPreviewFiles("app close");
          await appWindow.close();
        });
      } catch (error) {
        debug("close handler failed: %O", error);
      }
    };

    void attach();

    return () => {
      if (unlisten) {
        unlisten();
      }
      if (!isClosingRef.current) {
        void cleanupAllPreviewFiles("app unmount");
      }
    };
  }, []);
};

export default useAppCleanup;
