import { useCallback, useEffect, useState } from "react";
import { checkFfmpegSidecars, type FfmpegStatus } from "@/system/ffmpeg";

// Checks FFmpeg availability once per mount and exposes a retry.
const useFfmpegStatus = () => {
  const [status, setStatus] = useState<FfmpegStatus>({
    state: "checking",
    message: "Checking FFmpeg sidecars..."
  });

  const refresh = useCallback(async () => {
    setStatus({
      state: "checking",
      message: "Checking FFmpeg sidecars..."
    });
    const result = await checkFfmpegSidecars();
    setStatus(result);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    status,
    refresh,
    isReady: status.state === "ready"
  };
};

export default useFfmpegStatus;
