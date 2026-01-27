import { useCallback, useRef, useState } from "react";
import type { VideoAsset } from "@/domain/video";
import { runFfmpegJob, type FfmpegRunHandle } from "@/jobs/ffmpegRunner";
import type { ModeConfigMap, ModeId } from "@/modes/definitions";
import type { JobProgress, JobState } from "@/jobs/types";
import { buildDefaultOutputPath } from "@/jobs/output";
import makeDebug from "@/utils/debug";

const initialProgress: JobProgress = {
  percent: 0
};

const initialState: JobState = {
  status: "idle",
  progress: initialProgress
};

const debug = makeDebug("jobs:ffmpeg");

const formatErrorWithLogs = (message: string, logTail: string[]) => {
  if (logTail.length === 0) {
    return message;
  }
  const tail = logTail.join("\n").trim();
  return tail
    ? `${message}\n\n--- ffmpeg log tail ---\n${tail}`
    : message;
};

// Tracks a single ffmpeg job and exposes run/cancel controls.
const useFfmpegJob = () => {
  const [job, setJob] = useState<JobState>(initialState);
  const handleRef = useRef<FfmpegRunHandle | null>(null);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const logBufferRef = useRef<string[]>([]);

  const run = useCallback(
    async (
      asset: VideoAsset,
      durationSeconds?: number,
      outputPath?: string,
      modeId?: ModeId,
      modeConfig?: ModeConfigMap[ModeId]
    ) => {
      if (!asset.path || asset.path.trim().length === 0) {
        return;
      }
      if (runningRef.current) {
        return;
      }
      runningRef.current = true;
      cancelRef.current = false;
      logBufferRef.current = [];
      const resolvedOutputPath =
        outputPath ?? buildDefaultOutputPath(asset.path);
      debug("run start: mode=%s output=%s", modeId ?? "analog", resolvedOutputPath);
      setJob({
        status: "running",
        progress: initialProgress,
        outputPath: resolvedOutputPath,
        error: undefined
      });

      try {
        const handle = await runFfmpegJob(
          asset,
          {
            durationSeconds,
            outputPath: resolvedOutputPath,
            modeId,
            modeConfig
          },
          {
            onProgress: (progress) => {
              setJob((prev) => ({
                ...prev,
                status: "running",
                progress: {
                  ...prev.progress,
                  ...progress,
                  percent: progress.percent
                }
              }));
            },
            onLog: (line) => {
              if (!line.trim()) {
                return;
              }
              logBufferRef.current.push(line.trim());
              if (logBufferRef.current.length > 400) {
                logBufferRef.current.splice(0, logBufferRef.current.length - 400);
              }
              debug("ffmpeg log: %s", line.trim());
            },
            onError: (message) => {
              runningRef.current = false;
              const tail = logBufferRef.current.slice(-60);
              const errorWithTail = formatErrorWithLogs(message, tail);
              debug("run error: %s", errorWithTail);
              setJob((prev) => ({
                ...prev,
                status: "error",
                error: errorWithTail
              }));
            },
            onClose: (code) => {
              runningRef.current = false;
              const tail = logBufferRef.current.slice(-60);
              const tailMessage = formatErrorWithLogs("ffmpeg failed", tail);
              debug("run close: code=%s canceled=%s", code, cancelRef.current);
              setJob((prev) => ({
                ...prev,
                status: cancelRef.current
                  ? "canceled"
                  : code === 0
                    ? "success"
                    : "error",
                error:
                  cancelRef.current || code === 0
                    ? undefined
                    : prev.error ?? tailMessage,
                progress:
                  code === 0 && !cancelRef.current
                    ? { ...prev.progress, percent: 100 }
                    : prev.progress
              }));
            }
          }
        );
        handleRef.current = handle;
        setJob((prev) => ({ ...prev, outputPath: handle.outputPath }));
      } catch (error) {
        runningRef.current = false;
        const message = error instanceof Error ? error.message : "Failed to start ffmpeg";
        debug("run exception: %O", error);
        setJob((prev) => ({
          ...prev,
          status: "error",
          error: message
        }));
      }
    },
    []
  );

  const cancel = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) {
      return;
    }
    cancelRef.current = true;
    await handle.cancel();
    handleRef.current = null;
    runningRef.current = false;
    debug("run canceled");
    setJob((prev) => ({
      ...prev,
      status: "canceled"
    }));
  }, []);

  return {
    job,
    run,
    cancel
  };
};

export default useFfmpegJob;
