import type { JobProgress } from "@/jobs/types";

const parseNumber = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseIntValue = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSpeed = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().replace(/x$/i, "");
  return parseNumber(normalized);
};

const parseBitrate = (value?: string) => {
  if (!value) {
    return undefined;
  }
  return value.trim();
};

const parseTimecode = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parts = value.trim().split(":");
  if (parts.length !== 3) {
    return undefined;
  }
  const [hours, minutes, seconds] = parts;
  const parsedHours = parseNumber(hours) ?? 0;
  const parsedMinutes = parseNumber(minutes) ?? 0;
  const parsedSeconds = parseNumber(seconds) ?? 0;
  if (![parsedHours, parsedMinutes, parsedSeconds].every(Number.isFinite)) {
    return undefined;
  }
  return parsedHours * 3600 + parsedMinutes * 60 + parsedSeconds;
};

const parseOutTime = (raw: Record<string, string>) => {
  if (raw.out_time) {
    const parsed = parseTimecode(raw.out_time);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  if (raw.out_time_us) {
    const parsed = parseNumber(raw.out_time_us);
    return parsed !== undefined ? parsed / 1_000_000 : undefined;
  }

  if (raw.out_time_ms) {
    const parsed = parseNumber(raw.out_time_ms);
    return parsed !== undefined ? parsed / 1_000_000 : undefined;
  }

  return undefined;
};

const computePercent = (timeSeconds?: number, durationSeconds?: number) => {
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(durationSeconds)) {
    return 0;
  }
  if (!durationSeconds || durationSeconds <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (timeSeconds / durationSeconds) * 100));
};

const computeElapsedSeconds = (startedAt: number) =>
  Math.max(0, (Date.now() - startedAt) / 1000);

const computeEtaSeconds = (options: {
  percent: number;
  elapsedSeconds: number;
  speed?: number;
  durationSeconds?: number;
  outTimeSeconds?: number;
}) => {
  const { percent, elapsedSeconds, speed, durationSeconds, outTimeSeconds } = options;
  if (
    typeof speed === "number" &&
    Number.isFinite(speed) &&
    speed > 0 &&
    typeof outTimeSeconds === "number" &&
    Number.isFinite(outTimeSeconds) &&
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds)
  ) {
    const remaining = Math.max(0, durationSeconds - outTimeSeconds);
    return remaining / speed;
  }

  if (Number.isFinite(percent) && percent > 0 && elapsedSeconds > 0) {
    return (elapsedSeconds * (100 - percent)) / percent;
  }

  return undefined;
};

export type ProgressParser = (chunk: string) => void;

// Builds a parser that turns ffmpeg progress output into structured updates.
export const createFfmpegProgressParser = (
  durationSeconds: number | undefined,
  onProgress: (progress: JobProgress) => void
): ProgressParser => {
  let buffer = "";
  let current: Record<string, string> = {};
  const startedAt = Date.now();

  const commit = () => {
    const outTimeSeconds = parseOutTime(current);
    const percent = computePercent(outTimeSeconds, durationSeconds);
    const elapsedSeconds = computeElapsedSeconds(startedAt);
    const speed = parseSpeed(current.speed);
    const next: JobProgress = {
      percent,
      frame: parseIntValue(current.frame),
      fps: parseNumber(current.fps),
      speed,
      bitrate: parseBitrate(current.bitrate),
      outTimeSeconds,
      totalSizeBytes: parseIntValue(current.total_size),
      elapsedSeconds,
      etaSeconds: computeEtaSeconds({
        percent,
        elapsedSeconds,
        speed,
        durationSeconds,
        outTimeSeconds
      })
    };
    onProgress(next);
    current = {};
  };

  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) {
        continue;
      }
      const [key, ...rest] = line.split("=");
      if (!key || rest.length === 0) {
        continue;
      }
      const value = rest.join("=").trim();
      if (!value) {
        continue;
      }

      if (key === "progress") {
        commit();
        continue;
      }

      current[key.trim()] = value;
    }
  };
};
