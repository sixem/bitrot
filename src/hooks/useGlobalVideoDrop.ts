import { useCallback, useMemo } from "react";
import useFileDragOverlay from "@/hooks/useFileDragOverlay";
import { isSupportedVideoPath, videoExtensionsLabel } from "@/domain/video";
import useModal from "@/ui/modal/useModal";
import useToast from "@/ui/toast/useToast";

type UseGlobalVideoDropOptions = {
  isEnabled?: boolean;
  onVideoSelected: (path: string) => void;
};

const getFirstPath = (paths: string[]) => paths[0];

// Global video drop handler shared by landing + editor.
const useGlobalVideoDrop = ({
  isEnabled = true,
  onVideoSelected
}: UseGlobalVideoDropOptions) => {
  const { openModal } = useModal();
  const { pushToast } = useToast();

  const handleInvalidDrop = useCallback(
    (message: string) => {
      openModal({
        title: "Unsupported file",
        message
      });
    },
    [openModal]
  );

  const handleDropPaths = useCallback(
    (paths: string[]) => {
      const first = getFirstPath(paths);
      if (!first) {
        return;
      }

      if (!isSupportedVideoPath(first)) {
        handleInvalidDrop(`Please drop a video file (${videoExtensionsLabel()}).`);
        return;
      }

      const name = first.split(/[/\\]/).pop() ?? first;
      pushToast(`Loaded ${name}`, "success");
      onVideoSelected(first);
    },
    [handleInvalidDrop, onVideoSelected, pushToast]
  );

  const isDragging = useFileDragOverlay({
    isEnabled,
    onDropPaths: handleDropPaths
  });

  return useMemo(
    () => ({
      isDragging,
      handleDropPaths
    }),
    [handleDropPaths, isDragging]
  );
};

export default useGlobalVideoDrop;
