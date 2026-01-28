import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow, ProgressBarStatus, type UnlistenFn } from "@tauri-apps/api/window";
import type { VideoAsset } from "@/domain/video";
import { runFfmpegJob, type FfmpegRunHandle } from "@/jobs/ffmpegRunner";
import type { ModeConfigMap, ModeId } from "@/modes/definitions";
import type { JobProgress, JobState } from "@/jobs/types";
import { buildDefaultOutputPath } from "@/jobs/output";
import type { EncodingId } from "@/jobs/encoding";
import {
  cleanupAllJobs,
  cleanupJob,
  registerJobCleanup
} from "@/jobs/jobCleanup";
import makeDebug from "@/utils/debug";

const initialProgress: JobProgress = {
  percent: 0
};

const initialState: JobState = {
  status: "idle",
  progress: initialProgress
};

const debug = makeDebug("jobs:ffmpeg");
const appWindow = getCurrentWindow();

const formatErrorWithLogs = (message: string, logTail: string[]) => {
  if (logTail.length === 0) {
    return message;
  }
  const tail = logTail.join("\n").trim();
  return tail
    ? `${message}\n\n--- ffmpeg log tail ---\n${tail}`
    : message;
};

const clampProgress = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

const resetProgressState = (status: JobState["status"], outputPath?: string) => ({
  status,
  progress: initialProgress,
  outputPath,
  error: undefined
});

const setTaskbarProgress = async (status: ProgressBarStatus, progress?: number) => {
  try {
    await appWindow.setProgressBar({
      status,
      progress: progress === undefined ? undefined : clampProgress(progress)
    });
  } catch (error) {
    debug("taskbar progress failed: %O", error);
  }
};

// Tracks a single ffmpeg job and exposes run/cancel controls.
const useFfmpegJob = () => {
  const [job, setJob] = useState<JobState>(initialState);
  const handleRef = useRef<FfmpegRunHandle | null>(null);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const closingRef = useRef(false);
  const logBufferRef = useRef<string[]>([]);
  const cleanupPathRef = useRef<string | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    appWindow
      .onCloseRequested(async (event) => {
        if (closingRef.current) {
          return;
        }

        if (runningRef.current) {
          event.preventDefault();
          closingRef.current = true;
          cancelRef.current = true;
          try {
            await handleRef.current?.cancel();
          } catch (error) {
            debug("cancel on close failed: %O", error);
          }
          await cleanupAllJobs();
          await appWindow.close();
          return;
        }

        await cleanupAllJobs();
      })
      .then((stop) => {
        unlisten = stop;
      })
      .catch((error) => {
        debug("close listener failed: %O", error);
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const run = useCallback(
    async (
      asset: VideoAsset,
      durationSeconds?: number,
      outputPath?: string,
      modeId?: ModeId,
      modeConfig?: ModeConfigMap[ModeId],
      encodingId?: EncodingId,
      trimStartSeconds?: number,
      trimEndSeconds?: number
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
      cleanupPathRef.current = resolvedOutputPath;
      registerJobCleanup(resolvedOutputPath, modeId);
      debug("run start: mode=%s output=%s", modeId ?? "analog", resolvedOutputPath);
      setJob({
        status: "running",
        progress: initialProgress,
        outputPath: resolvedOutputPath,
        error: undefined
      });
      await setTaskbarProgress(ProgressBarStatus.Normal, 0);

      try {
        const handle = await runFfmpegJob(
          asset,
          {
            durationSeconds,
            outputPath: resolvedOutputPath,
            modeId,
            modeConfig,
            encodingId,
            trimStartSeconds,
            trimEndSeconds
          },
          {
            onProgress: (progress) => {
              void setTaskbarProgress(
                ProgressBarStatus.Normal,
                progress.percent ?? 0
              );
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
              if (cancelRef.current) {
                return;
              }
              runningRef.current = false;
              void setTaskbarProgress(ProgressBarStatus.None, 0);
              const tail = logBufferRef.current.slice(-60);
              const errorWithTail = formatErrorWithLogs(message, tail);
              debug("run error: %s", errorWithTail);
              if (cleanupPathRef.current) {
                void cleanupJob(cleanupPathRef.current, { keepOutput: false });
              }
              setJob((prev) => ({
                ...prev,
                status: "error",
                error: errorWithTail
              }));
            },
            onClose: (code) => {
              runningRef.current = false;
              void setTaskbarProgress(ProgressBarStatus.None, 0);
              const tail = logBufferRef.current.slice(-60);
              const tailMessage = formatErrorWithLogs("ffmpeg failed", tail);
              if (cleanupPathRef.current) {
                void cleanupJob(cleanupPathRef.current, {
                  keepOutput: cancelRef.current ? false : code === 0
                });
              }
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
                progress: cancelRef.current
                  ? initialProgress
                  : code === 0
                    ? { ...prev.progress, percent: 100 }
                    : prev.progress
              }));
            }
          }
        );
        handleRef.current = handle;
        if (cleanupPathRef.current !== handle.outputPath) {
          registerJobCleanup(handle.outputPath, modeId);
        }
        cleanupPathRef.current = handle.outputPath;
        setJob((prev) => ({ ...prev, outputPath: handle.outputPath }));
      } catch (error) {
        runningRef.current = false;
        if (cleanupPathRef.current) {
          void cleanupJob(cleanupPathRef.current, { keepOutput: false });
        }
        await setTaskbarProgress(ProgressBarStatus.None, 0);
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
      if (cleanupPathRef.current) {
        await cleanupJob(cleanupPathRef.current, { keepOutput: false });
      }
      return;
    }
    cancelRef.current = true;
    await handle.cancel();
    handleRef.current = null;
    runningRef.current = false;
    debug("run canceled");
    void setTaskbarProgress(ProgressBarStatus.None, 0);
    if (cleanupPathRef.current) {
      await cleanupJob(cleanupPathRef.current, { keepOutput: false });
    }
    setJob((prev) => resetProgressState("canceled", prev.outputPath));
  }, []);

  return {
    job,
    run,
    cancel
  };
};

export default useFfmpegJob;
