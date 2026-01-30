// Shared event listeners for native-mode progress + log streams.
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { JobProgress } from "@/jobs/types";

type NativeProgressPayload = {
  jobId: string;
  frame: number;
  totalFrames?: number | null;
  percent: number;
  fps?: number | null;
  speed?: number | null;
  outTimeSeconds?: number | null;
  elapsedSeconds?: number | null;
  etaSeconds?: number | null;
};

type NativeLogPayload = {
  jobId: string;
  message: string;
};

type NativeJobEvents = {
  progress: string;
  log: string;
};

type NativeJobCallbacks = {
  onProgress: (progress: JobProgress) => void;
  onLog: (line: string) => void;
};

const appWindow = getCurrentWindow();

// Shared listener wiring for native-mode progress and logs.
export const attachNativeJobListeners = async (
  jobId: string,
  events: NativeJobEvents,
  callbacks: NativeJobCallbacks
) => {
  const progressUnlisten = await appWindow.listen<NativeProgressPayload>(
    events.progress,
    (event) => {
      if (event.payload.jobId !== jobId) {
        return;
      }
      callbacks.onProgress({
        percent: event.payload.percent,
        frame: event.payload.frame,
        fps:
          typeof event.payload.fps === "number" ? event.payload.fps : undefined,
        speed:
          typeof event.payload.speed === "number" ? event.payload.speed : undefined,
        outTimeSeconds:
          typeof event.payload.outTimeSeconds === "number"
            ? event.payload.outTimeSeconds
            : undefined,
        elapsedSeconds:
          typeof event.payload.elapsedSeconds === "number"
            ? event.payload.elapsedSeconds
            : undefined,
        etaSeconds:
          typeof event.payload.etaSeconds === "number"
            ? event.payload.etaSeconds
            : undefined
      });
    }
  );

  const logUnlisten = await appWindow.listen<NativeLogPayload>(
    events.log,
    (event) => {
      if (event.payload.jobId !== jobId) {
        return;
      }
      callbacks.onLog(event.payload.message);
    }
  );

  return () => {
    progressUnlisten();
    logUnlisten();
  };
};
