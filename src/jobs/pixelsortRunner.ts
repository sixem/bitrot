// Tauri bridge for the Rust pixel sort pipeline with progress + log wiring.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { VideoAsset } from "@/domain/video";
import type { JobProgress } from "@/jobs/types";
import { pathsMatch } from "@/jobs/output";
import { normalizeTrimRange } from "@/jobs/trim";
import { probeVideo } from "@/system/ffprobe";
import {
  estimateInputBitrateCapKbps,
  estimateTargetBitrateKbps
} from "@/jobs/exportEncoding";
import {
  resolveNvencPreset,
  resolveVp9Settings,
  resolveX264Preset,
  DEFAULT_EXPORT_PROFILE,
  type ExportProfile
} from "@/jobs/exportProfile";
import type { PixelsortConfig } from "@/modes/pixelsort";
import { sanitizePath } from "@/system/path";
import makeDebug from "@/utils/debug";

type PixelsortCallbacks = {
  onProgress: (progress: JobProgress) => void;
  onLog: (line: string) => void;
  onClose: (code: number | null, signal: string | null) => void;
  onError: (message: string) => void;
};

export type PixelsortRunHandle = {
  outputPath: string;
  jobId: string;
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
const appWindow = getCurrentWindow();

const createJobId = () =>
  `pixelsort-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const clampEven = (value: number) => value - (value % 2);

const resolvePixelsortFps = (avgFps?: number, nominalFps?: number) => {
  if (
    typeof avgFps === "number" &&
    typeof nominalFps === "number" &&
    Number.isFinite(avgFps) &&
    Number.isFinite(nominalFps) &&
    nominalFps > avgFps * 1.4
  ) {
    return nominalFps;
  }
  if (typeof avgFps === "number" && Number.isFinite(avgFps) && avgFps > 0) {
    return avgFps;
  }
  if (
    typeof nominalFps === "number" &&
    Number.isFinite(nominalFps) &&
    nominalFps > 0
  ) {
    return nominalFps;
  }
  return 30;
};

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

const resolveAudioCodec = (format: string) =>
  format === "webm" ? "opus" : "aac";

const resolveAudioBitrateKbps = (format: string) =>
  format === "webm" ? 160 : 192;

const attachPixelsortListeners = async (
  jobId: string,
  callbacks: PixelsortCallbacks
) => {
  // Rust emits these updates on the window, so attach window-scoped listeners.
  const progressUnlisten = await appWindow.listen<PixelsortProgressPayload>(
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

  const logUnlisten = await appWindow.listen<PixelsortLogPayload>(
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
  profile: ExportProfile,
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
  const safeFps = resolvePixelsortFps(metadata.avgFps, metadata.nominalFps);
  const trimRange = normalizeTrimRange(trimStartSeconds, trimEndSeconds, {
    durationSeconds: metadata.durationSeconds
  });
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

  const resolvedProfile = profile ?? DEFAULT_EXPORT_PROFILE;
  const bitrateCapKbps = estimateInputBitrateCapKbps(
    metadata.sizeBytes,
    metadata.durationSeconds
  );
  const targetBitrateKbps = estimateTargetBitrateKbps(
    resolvedProfile.sizeCapMb,
    resolvedDuration
  );
  const maxBitrateKbps = targetBitrateKbps ?? bitrateCapKbps;
  const vp9Settings =
    resolvedProfile.videoEncoder === "libvpx-vp9"
      ? resolveVp9Settings(resolvedProfile.videoSpeed)
      : null;
  const wantsTwoPass =
    resolvedProfile.videoEncoder === "libvpx-vp9" &&
    (resolvedProfile.passMode === "2pass" ||
      (resolvedProfile.passMode === "auto" &&
        resolvedProfile.sizeCapMb !== undefined));
  if (wantsTwoPass) {
    callbacks.onLog(
      "VP9 two-pass is not supported for pixel sort yet. Using single-pass output."
    );
  }
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
      encoder: resolvedProfile.videoEncoder,
      preset:
        resolvedProfile.videoEncoder === "h264_nvenc"
          ? resolveNvencPreset(resolvedProfile.videoSpeed)
          : resolvedProfile.videoEncoder === "libvpx-vp9"
            ? vp9Settings?.deadline ?? "good"
            : resolveX264Preset(resolvedProfile.videoSpeed),
      crf:
        resolvedProfile.videoEncoder === "libx264" ||
        resolvedProfile.videoEncoder === "libvpx-vp9"
          ? resolvedProfile.quality
          : undefined,
      cq:
        resolvedProfile.videoEncoder === "h264_nvenc"
          ? resolvedProfile.quality
          : undefined,
      maxBitrateKbps,
      targetBitrateKbps,
      vp9Deadline:
        resolvedProfile.videoEncoder === "libvpx-vp9"
          ? vp9Settings?.deadline
          : undefined,
      vp9CpuUsed:
        resolvedProfile.videoEncoder === "libvpx-vp9"
          ? vp9Settings?.cpuUsed
          : undefined,
      format: resolvedProfile.format,
      audioEnabled: resolvedProfile.audioEnabled,
      audioCodec: resolvedProfile.audioEnabled
        ? resolveAudioCodec(resolvedProfile.format)
        : undefined,
      audioBitrateKbps: resolvedProfile.audioEnabled
        ? resolveAudioBitrateKbps(resolvedProfile.format)
        : undefined
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
    jobId,
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
