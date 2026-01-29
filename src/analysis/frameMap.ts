// Shared frame map structures used by future processing modes.
import type { FrameMapPayload } from "@/system/ffprobeFrames";

// Store times in compact typed arrays to keep VFR maps lightweight.
export type FrameMap = {
  times: Float64Array;
  keyframeTimes: Float64Array;
  durationSeconds?: number;
};

// Normalizes the minimal Rust payload into typed arrays for UI use.
export const buildFrameMap = (payload: FrameMapPayload): FrameMap => ({
  times: Float64Array.from(payload.times),
  keyframeTimes: Float64Array.from(payload.keyframeTimes),
  durationSeconds: payload.durationSeconds
});
