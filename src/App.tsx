import { useCallback, useEffect, useState } from "react";
import Landing from "@/components/Landing";
import Editor from "@/editor/Editor";
import { createVideoAssetFromPath, type VideoAsset } from "@/domain/video";
import FfmpegGate from "@/components/FfmpegGate";
import useFfmpegStatus from "@/system/useFfmpegStatus";
import ModalProvider from "@/ui/modal/ModalProvider";
import ToastProvider from "@/ui/toast/ToastProvider";

// Root app component. Keep this small so layouts stay swappable later.
const App = () => {
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
          <Editor asset={asset} onReplace={handleVideoSelected} />
        ) : (
          <Landing isReady={isReady} onVideoSelected={handleVideoSelected} />
        )}
        <FfmpegGate status={status} onRetry={refresh} />
      </ModalProvider>
    </ToastProvider>
  );
};

export default App;
