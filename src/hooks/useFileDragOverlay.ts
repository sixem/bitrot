import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

type FileDropOptions = {
  isEnabled?: boolean;
  onDropPaths?: (paths: string[]) => void;
};

// Tracks when a file is being dragged over the window (native Tauri drop).
const useFileDragOverlay = (options: FileDropOptions = {}) => {
  const { isEnabled = true, onDropPaths } = options;
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isEnabled) {
      setIsDragging(false);
      return;
    }

    let unlisten: (() => void) | null = null;
    let active = true;

    const setup = async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (!active || !isEnabled) {
          return;
        }

        if (event.payload.type === "over") {
          setIsDragging(true);
          return;
        }

        if (event.payload.type === "drop") {
          setIsDragging(false);
          if (event.payload.paths.length > 0) {
            onDropPaths?.(event.payload.paths);
          }
          return;
        }

        setIsDragging(false);
      });
    };

    void setup();

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [isEnabled, onDropPaths]);

  return isDragging;
};

export default useFileDragOverlay;
