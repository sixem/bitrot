import { useEffect, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import type { FrameMap } from "@/analysis/frameMap";
import probeFrameMap from "@/analysis/probeFrameMap";

export type FrameMapState = {
  status: "idle" | "loading" | "ready" | "error";
  frameMap?: FrameMap;
  error?: string;
};

const initialState: FrameMapState = {
  status: "idle"
};

// Loads per-frame timestamps for VFR footage so timeline controls stay accurate.
const useFrameMap = (asset: VideoAsset | null, isEnabled: boolean) => {
  const [state, setState] = useState<FrameMapState>(initialState);
  const assetPath = asset?.path ?? "";

  useEffect(() => {
    if (!asset || !isEnabled) {
      setState(initialState);
      return;
    }

    if (!assetPath || assetPath.trim().length === 0) {
      setState({
        status: "error",
        error: "File path missing. Please re-select the video."
      });
      return;
    }

    let isMounted = true;
    setState({ status: "loading" });

    probeFrameMap(assetPath)
      .then((frameMap) => {
        if (!isMounted) {
          return;
        }
        setState({ status: "ready", frameMap });
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
  }, [asset, assetPath, isEnabled]);

  return state;
};

export default useFrameMap;
