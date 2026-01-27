import { useEffect, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import { probeVideo, type VideoMetadata } from "@/system/ffprobe";

export type MetadataState = {
  status: "idle" | "loading" | "ready" | "error";
  metadata?: VideoMetadata;
  error?: string;
};

const initialState: MetadataState = {
  status: "idle"
};

// Loads ffprobe metadata for the current asset.
const useVideoMetadata = (asset: VideoAsset | null) => {
  const [state, setState] = useState<MetadataState>(initialState);

  useEffect(() => {
    if (!asset) {
      setState(initialState);
      return;
    }

    if (!asset.path || asset.path.trim().length === 0) {
      setState({
        status: "error",
        error: "File path missing. Please re-select the video."
      });
      return;
    }

    let isMounted = true;
    setState({ status: "loading" });

    probeVideo(asset.path)
      .then((metadata) => {
        if (!isMounted) {
          return;
        }
        setState({ status: "ready", metadata });
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        setState({ status: "error", error: message });
      });

    return () => {
      isMounted = false;
    };
  }, [asset]);

  return state;
};

export default useVideoMetadata;
