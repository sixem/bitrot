// Scene detection helpers for datamosh pipelines.
import { spawnWithFallback } from "@/system/shellCommand";
import type { TrimRange } from "@/jobs/trim";
import { buildTrimArgs } from "@/jobs/datamosh/normalizeArgs";
import makeDebug from "@/utils/debug";

type SceneWindow = {
  start: number;
  end: number;
};

const debug = makeDebug("jobs:datamosh:scene");
const SCENE_TIME_REGEX = /pts_time:([0-9.]+)/g;
const OUTPUT_TAIL_LIMIT = 2000;

const parseSceneTimesFromLine = (line: string, times: Set<number>) => {
  SCENE_TIME_REGEX.lastIndex = 0;
  for (const match of line.matchAll(SCENE_TIME_REGEX)) {
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value)) {
      times.add(value);
    }
  }
};

const createLineBuffer = (onLine: (line: string) => void) => {
  let buffer = "";
  return {
    push: (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        onLine(line);
        index = buffer.indexOf("\n");
      }
    },
    flush: () => {
      if (buffer.trim().length > 0) {
        onLine(buffer);
      }
      buffer = "";
    }
  };
};

const createTailBuffer = (limit: number) => {
  let tail = "";
  return {
    push: (chunk: string) => {
      if (!chunk) {
        return;
      }
      tail = `${tail}${chunk}`;
      if (tail.length > limit) {
        tail = tail.slice(-limit);
      }
    },
    read: () => tail
  };
};

const detectSceneCuts = async (
  inputPath: string,
  threshold: number,
  trim?: TrimRange
) => {
  const args = [
    "-hide_banner",
    "-i",
    inputPath,
    ...buildTrimArgs(trim),
    // Align scene detection with normalization by forcing the first video stream.
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    `select='gt(scene\\,${threshold})',showinfo`,
    "-f",
    "null",
    "-"
  ];
  debug("detectSceneCuts start (threshold=%d)", threshold);
  debug("detectSceneCuts args: %o", args);

  const times = new Set<number>();
  const tail = createTailBuffer(OUTPUT_TAIL_LIMIT);
  const lineBuffer = createLineBuffer((line) => {
    parseSceneTimesFromLine(line, times);
  });

  return new Promise<number[]>(async (resolve, reject) => {
    let settled = false;

    const finalize = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      lineBuffer.flush();
      if (error) {
        reject(error);
        return;
      }
      const cuts = [...times].sort((a, b) => a - b);
      debug("detectSceneCuts complete (cuts=%d)", cuts.length);
      resolve(cuts);
    };

    try {
      await spawnWithFallback("ffmpeg", args, (command, source) => {
        debug("detectSceneCuts source: %s", source);
        const handleChunk = (chunk: string) => {
          tail.push(chunk);
          lineBuffer.push(chunk);
        };

        command.stdout.on("data", (line) => {
          if (typeof line === "string") {
            handleChunk(line);
          }
        });

        command.stderr.on("data", (line) => {
          if (typeof line === "string") {
            handleChunk(line);
          }
        });

        command.on("error", (message) => {
          const trimmed = message?.trim();
          finalize(new Error(trimmed || "Scene detection failed"));
        });

        command.on("close", ({ code, signal }) => {
          if (code === 0) {
            finalize();
            return;
          }
          const tailValue = tail.read().trim();
          const signalLabel =
            signal === null || signal === undefined ? "" : ` (signal ${signal})`;
          const message =
            tailValue || `Scene detection failed (code ${code}${signalLabel})`;
          debug("detectSceneCuts failed (code=%s signal=%s)", code, signal);
          finalize(new Error(message));
        });
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Scene detection failed");
      finalize(new Error(message));
    }
  });
};

const buildSceneWindows = (
  cuts: number[],
  durationSeconds: number,
  fps: number,
  moshLengthSeconds: number
): SceneWindow[] => {
  const frameDuration = 1 / Math.max(1, fps);
  const duration = Math.max(durationSeconds, frameDuration);
  const pad = frameDuration;
  const safeCuts = cuts
    .map((cut) => Math.max(0, Math.min(duration, cut)))
    .filter(
      (cut, index, list) =>
        index === 0 || Math.abs(cut - list[index - 1]) > frameDuration / 2
    );

  if (safeCuts.length === 0) {
    return [{ start: 0, end: duration }];
  }

  return safeCuts.map((cut) => {
    const start = Math.max(0, cut - pad);
    let end = duration;

    if (moshLengthSeconds > 0) {
      end = Math.min(duration, cut + Math.max(moshLengthSeconds, frameDuration));
    } else {
      // "Until next cut" now means "until the end of the clip".
      end = duration;
    }

    if (end <= start) {
      end = Math.min(duration, start + frameDuration);
    }

    return { start, end };
  });
};

export { buildSceneWindows, detectSceneCuts };
export type { SceneWindow };
