// Tauri bridge for the native modulo mapping pipeline.
// File name retained to avoid a wide rename across the repo.
import { invoke } from "@tauri-apps/api/core";
import type { VideoAsset } from "@/domain/video";
import type { JobProgress } from "@/jobs/types";
import { pathsMatch } from "@/jobs/output";
import { normalizeTrimRange } from "@/jobs/trim";
import { probeVideo } from "@/system/ffprobe";
import {
  estimateInputBitrateCapKbps,
  estimateTargetBitrateKbps
} from "@/jobs/exportEncoding";
import { DEFAULT_EXPORT_PROFILE, type ExportProfile } from "@/jobs/exportProfile";
import type { ModuloMappingConfig } from "@/modes/moduloMapping";
import { sanitizePath } from "@/system/path";
import { buildNativeEncoding } from "@/jobs/nativeEncoding";
import { attachNativeJobListeners } from "@/jobs/nativeJobEvents";
import { resolveNativeFps, resolveEvenDimensions } from "@/jobs/nativeVideo";
import makeDebug from "@/utils/debug";

type ModuloMappingCallbacks = {
  onProgress: (progress: JobProgress) => void;
  onLog: (line: string) => void;
  onClose: (code: number | null, signal: string | null) => void;
  onError: (message: string) => void;
};

export type ModuloMappingRunHandle = {
  outputPath: string;
  jobId: string;
  cancel: () => Promise<void>;
};

const MODULO_MAPPING_EVENTS = {
  progress: "modulo-mapping-progress",
  log: "modulo-mapping-log"
};

const debug = makeDebug("jobs:modulo-mapping");

const createJobId = () =>
  `modulo-mapping-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const isCancelError = (message: string) =>
  message.toLowerCase().includes("canceled");

// Runs the native modulo mapping pipeline for frame-level corruption.
export const runModuloMappingJob = async (
  asset: VideoAsset,
  outputPath: string,
  durationSeconds: number | undefined,
  config: ModuloMappingConfig,
  profile: ExportProfile,
  trimStartSeconds: number | undefined,
  trimEndSeconds: number | undefined,
  callbacks: ModuloMappingCallbacks
): Promise<ModuloMappingRunHandle> => {
  const inputPath = sanitizePath(asset.path);
  const cleanOutput = sanitizePath(outputPath);
  if (pathsMatch(inputPath, cleanOutput)) {
    throw new Error(
      "Output path matches the input file. Choose a different output name."
    );
  }
  const jobId = createJobId();

  debug("runModuloMappingJob start: input=%s output=%s", inputPath, cleanOutput);

  const metadata = await probeVideo(inputPath);
  const safeFps = resolveNativeFps(metadata.avgFps, metadata.nominalFps);
  const trimRange = normalizeTrimRange(trimStartSeconds, trimEndSeconds, {
    durationSeconds: metadata.durationSeconds
  });
  const resolvedDuration = trimRange
    ? Math.max(0, trimRange.end - trimRange.start)
    : metadata.durationSeconds ?? durationSeconds;
  const { width, height, adjusted } = resolveEvenDimensions(
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
  const wantsTwoPass =
    resolvedProfile.videoEncoder === "libvpx-vp9" &&
    (resolvedProfile.passMode === "2pass" ||
      (resolvedProfile.passMode === "auto" &&
        resolvedProfile.sizeCapMb !== undefined));
  if (wantsTwoPass) {
    callbacks.onLog(
      "VP9 two-pass is not supported for modulo mapping yet. Using single-pass output."
    );
  }
  callbacks.onProgress({ percent: 0 });

  const stopListening = await attachNativeJobListeners(
    jobId,
    MODULO_MAPPING_EVENTS,
    callbacks
  );
  let canceled = false;

  const runPromise = invoke("modulo_mapping_process", {
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
    encoding: buildNativeEncoding(resolvedProfile, {
      targetBitrateKbps,
      bitrateCapKbps
    })
  });

  runPromise
    .then(() => {
      callbacks.onClose(0, null);
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "Modulo mapping failed");
      debug("modulo-mapping failed: %O", error);
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
        await invoke("modulo_mapping_cancel", { jobId });
      } catch (error) {
        debug("modulo-mapping cancel failed: %O", error);
      }
    }
  };
};
