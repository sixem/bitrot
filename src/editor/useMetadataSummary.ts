// Computes user-facing metadata labels from the raw video probe state.
import { useMemo } from "react";
import type { VideoAsset } from "@/domain/video";
import type { MetadataState } from "@/editor/useVideoMetadata";

type MetadataSummary = {
  statusLabel: string;
  metadataDurationSeconds?: number;
  metadataSizeBytes?: number;
  metadataFps?: number;
  metadataIsVfr: boolean;
  fileType: string;
  folderPath: string;
};

// Derive the editor metadata summary shown in the info cards.
const useMetadataSummary = (
  asset: VideoAsset,
  metadataState: MetadataState
): MetadataSummary => {
  const metadataDurationSeconds = useMemo(() => {
    const duration = metadataState.metadata?.durationSeconds;
    return typeof duration === "number" && Number.isFinite(duration)
      ? duration
      : undefined;
  }, [metadataState.metadata?.durationSeconds]);

  const metadataSizeBytes = useMemo(() => {
    const size = metadataState.metadata?.sizeBytes;
    return typeof size === "number" && Number.isFinite(size) ? size : undefined;
  }, [metadataState.metadata?.sizeBytes]);

  const metadataFps = useMemo(() => {
    const fps = metadataState.metadata?.fps;
    return typeof fps === "number" && Number.isFinite(fps) ? fps : undefined;
  }, [metadataState.metadata?.fps]);

  const metadataIsVfr = metadataState.metadata?.isVfr ?? false;

  const statusLabel = useMemo(() => {
    if (metadataState.status === "loading") {
      return "Analyzing";
    }
    if (metadataState.status === "ready") {
      return "Ready";
    }
    if (metadataState.status === "error") {
      return "Metadata error";
    }
    return "Awaiting analysis";
  }, [metadataState.status]);

  const fileType = useMemo(
    () => asset.name.split(".").pop()?.toUpperCase() ?? "--",
    [asset.name]
  );

  const folderPath = useMemo(() => {
    if (!asset.path) {
      return "--";
    }
    return asset.path.replace(/[/\\\\][^/\\\\]+$/, "");
  }, [asset.path]);

  return {
    statusLabel,
    metadataDurationSeconds,
    metadataSizeBytes,
    metadataFps,
    metadataIsVfr,
    fileType,
    folderPath
  };
};

export default useMetadataSummary;
