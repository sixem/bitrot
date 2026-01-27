// Entry point that converts ffprobe frame output into a normalized frame map.
import { probeFrames } from "@/system/ffprobeFrames";
import { buildFrameMap, type FrameMap } from "@/analysis/frameMap";

// Convenience helper for modes: run ffprobe and return a normalized frame map.
const probeFrameMap = async (filePath: string): Promise<FrameMap> => {
  const raw = await probeFrames(filePath);
  return buildFrameMap(raw);
};

export default probeFrameMap;
