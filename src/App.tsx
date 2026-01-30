import { useCallback, useEffect, useState } from "react";
import Landing from "@/components/Landing";
import Editor from "@/editor/Editor";
import { createVideoAssetFromPath, type VideoAsset } from "@/domain/video";
import FfmpegGate from "@/components/FfmpegGate";
import useFfmpegStatus from "@/system/useFfmpegStatus";
import useAppCleanup from "@/system/useAppCleanup";
import ModalProvider from "@/ui/modal/ModalProvider";
import ShutdownModal from "@/ui/modal/ShutdownModal";
import ToastProvider from "@/ui/toast/ToastProvider";

// Root app component. Keep this small so layouts stay swappable later.
const App = () => {
  const { isClosing, message, forceClose } = useAppCleanup();
  const { status, refresh, isReady } = useFfmpegStatus();
  const [asset, setAsset] = useState<VideoAsset | null>(null);
  const handleVideoSelected = useCallback((path: string) => {
    setAsset(createVideoAssetFromPath(path));
  }, []);

  useEffect(() => {
    if (!isReady) {
      setAsset(null);
    }
  }, [isReady]);

  return (
    <ToastProvider>
      <ModalProvider>
        {asset ? (
          <Editor
            asset={asset}
            onReplace={handleVideoSelected}
            onBack={() => setAsset(null)}
          />
        ) : (
          <Landing isReady={isReady} onVideoSelected={handleVideoSelected} />
        )}
        <FfmpegGate status={status} onRetry={refresh} />
        <ShutdownModal isOpen={isClosing} message={message} onForceClose={forceClose} />
      </ModalProvider>
    </ToastProvider>
  );
};

export default App;
