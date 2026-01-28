import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { VideoAsset } from "@/domain/video";
import type { JobProgress } from "@/jobs/types";
import { pathsMatch } from "@/jobs/output";
import { probeVideo } from "@/system/ffprobe";
import {
  DEFAULT_ENCODING_ID,
  estimateBitrateCapKbps,
  getEncodingPreset,
  type EncodingId
} from "@/jobs/encoding";
import type { PixelsortConfig } from "@/modes/pixelsort";
import makeDebug from "@/utils/debug";

type PixelsortCallbacks = {
  onProgress: (progress: JobProgress) => void;
  onLog: (line: string) => void;
  onClose: (code: number | null, signal: string | null) => void;
  onError: (message: string) => void;
};

export type PixelsortRunHandle = {
  outputPath: string;
  cancel: () => Promise<void>;
};

type PixelsortProgressPayload = {
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

type PixelsortLogPayload = {
  jobId: string;
  message: string;
};

const debug = makeDebug("jobs:pixelsort");

const sanitizePath = (value: string) => value.trim().replace(/^"+|"+$/g, "");

type TrimRange = {
  start: number;
  end: number;
};

const normalizeTrimRange = (
  start?: number,
  end?: number,
  duration?: number
) => {
  if (typeof start !== "number" || typeof end !== "number") {
    return undefined;
  }
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(0, end);
  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd)) {
    return undefined;
  }
  if (safeEnd <= safeStart) {
    return undefined;
  }
  const clampedEnd =
    typeof duration === "number" && Number.isFinite(duration)
      ? Math.min(safeEnd, duration)
      : safeEnd;
  return { start: safeStart, end: clampedEnd } satisfies TrimRange;
};

const createJobId = () =>
  `pixelsort-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const clampEven = (value: number) => value - (value % 2);

const resolveDimensions = (width?: number, height?: number) => {
  if (!width || !height) {
    throw new Error("ffprobe did not return video dimensions.");
  }
  const safeWidth = clampEven(Math.floor(width));
  const safeHeight = clampEven(Math.floor(height));
  if (safeWidth <= 0 || safeHeight <= 0) {
    throw new Error("Pixel sort received invalid video dimensions.");
  }
  return {
    width: safeWidth,
    height: safeHeight,
    adjusted: safeWidth !== width || safeHeight !== height
  };
};

const attachPixelsortListeners = async (
  jobId: string,
  callbacks: PixelsortCallbacks
) => {
  const progressUnlisten = await listen<PixelsortProgressPayload>(
    "pixelsort-progress",
    (event) => {
      if (event.payload.jobId !== jobId) {
        return;
      }
      callbacks.onProgress({
        percent: event.payload.percent,
        frame: event.payload.frame,
        fps:
          typeof event.payload.fps === "number"
            ? event.payload.fps
            : undefined,
        speed:
          typeof event.payload.speed === "number"
            ? event.payload.speed
            : undefined,
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

  const logUnlisten = await listen<PixelsortLogPayload>(
    "pixelsort-log",
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

const isCancelError = (message: string) =>
  message.toLowerCase().includes("canceled");

// Runs the Rust-powered pixel sort pipeline for full per-pixel control.
export const runPixelsortJob = async (
  asset: VideoAsset,
  outputPath: string,
  durationSeconds: number | undefined,
  config: PixelsortConfig,
  encodingId: EncodingId,
  trimStartSeconds: number | undefined,
  trimEndSeconds: number | undefined,
  callbacks: PixelsortCallbacks
): Promise<PixelsortRunHandle> => {
  const inputPath = sanitizePath(asset.path);
  const cleanOutput = sanitizePath(outputPath);
  if (pathsMatch(inputPath, cleanOutput)) {
    throw new Error(
      "Output path matches the input file. Choose a different output name."
    );
  }
  const jobId = createJobId();

  debug("runPixelsortJob start: input=%s output=%s", inputPath, cleanOutput);

  const metadata = await probeVideo(inputPath);
  const safeFps =
    typeof metadata.fps === "number" && metadata.fps > 0 ? metadata.fps : 30;
  const trimRange = normalizeTrimRange(
    trimStartSeconds,
    trimEndSeconds,
    metadata.durationSeconds
  );
  const resolvedDuration = trimRange
    ? Math.max(0, trimRange.end - trimRange.start)
    : metadata.durationSeconds ?? durationSeconds;
  const { width, height, adjusted } = resolveDimensions(
    metadata.width,
    metadata.height
  );
  if (adjusted) {
    callbacks.onLog(`Adjusted dimensions to even size: ${width}x${height}.`);
  }

  const encoding = getEncodingPreset(encodingId ?? DEFAULT_ENCODING_ID);
  const bitrateCapKbps = estimateBitrateCapKbps(
    metadata.sizeBytes,
    metadata.durationSeconds,
    encoding
  );
  callbacks.onProgress({ percent: 0 });

  const stopListening = await attachPixelsortListeners(jobId, callbacks);
  let canceled = false;

  const runPromise = invoke("pixelsort_process", {
    jobId,
    inputPath,
    outputPath: cleanOutput,
    width,
    height,
    fps: safeFps,
    durationSeconds: resolvedDuration,
    config,
    previewEnabled: true,
    trimStartSeconds: trimRange?.start,
    trimEndSeconds: trimRange?.end,
    encoding: {
      encoder: encoding.encoder,
      preset: encoding.preset,
      crf: encoding.crf,
      cq: encoding.cq,
      maxBitrateKbps: bitrateCapKbps
    }
  });

  runPromise
    .then(() => {
      callbacks.onClose(0, null);
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "Pixel sort failed");
      debug("pixelsort failed: %O", error);
      if (!canceled && !isCancelError(message)) {
        callbacks.onError(message);
      }
      callbacks.onClose(1, null);
    })
    .finally(() => {
      stopListening();
    });

  return {
    outputPath: cleanOutput,
    cancel: async () => {
      canceled = true;
      try {
        await invoke("pixelsort_cancel", { jobId });
      } catch (error) {
        debug("pixelsort cancel failed: %O", error);
      }
    }
  };
};
