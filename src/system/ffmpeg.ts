import { executeWithFallback, type CommandSource } from "@/system/shellCommand";
import makeDebug from "@/utils/debug";

export type FfmpegStatus = {
  state: "checking" | "ready" | "missing";
  message: string;
  details?: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  source?: CommandSource;
};

const debug = makeDebug("system:ffmpeg");

const getFirstLine = (value: string) =>
  value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
};

const findVersionLine = (output: string, prefix: string) =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(prefix.toLowerCase())) ?? "";

const runProgram = async (program: "ffmpeg" | "ffprobe", expectedPrefix: string) => {
  try {
    const { output, source } = await executeWithFallback(program, ["-version"]);
    const combinedOutput = [output.stdout, output.stderr]
      .filter(Boolean)
      .join("\n");
    const versionLine = findVersionLine(combinedOutput, expectedPrefix);

    if (output.code !== 0 && !versionLine) {
      return {
        ok: false,
        error: combinedOutput.trim() || "Exit code error"
      } as const;
    }

    return {
      ok: true,
      version: versionLine || getFirstLine(combinedOutput),
      source
    } as const;
  } catch (error) {
    return { ok: false, error: formatError(error) } as const;
  }
};

// Checks FFmpeg availability using local -> sidecar -> PATH resolution.
export const checkFfmpegSidecars = async (): Promise<FfmpegStatus> => {
  const [ffmpegResult, ffprobeResult] = await Promise.all([
    runProgram("ffmpeg", "ffmpeg version"),
    runProgram("ffprobe", "ffprobe version")
  ]);

  if (!ffmpegResult.ok || !ffprobeResult.ok) {
    debug("ffmpeg check failed: %o %o", ffmpegResult, ffprobeResult);
    return {
      state: "missing",
      message:
        "FFmpeg not found. Place binaries next to the app, ship sidecars, or add them to PATH.",
      details: [
        !ffmpegResult.ok ? `ffmpeg: ${ffmpegResult.error}` : null,
        !ffprobeResult.ok ? `ffprobe: ${ffprobeResult.error}` : null
      ]
        .filter(Boolean)
        .join(" | ")
    };
  }

  const source = ffmpegResult.source ?? ffprobeResult.source;
  return {
    state: "ready",
    message: source ? `FFmpeg is ready (${source}).` : "FFmpeg is ready.",
    ffmpegVersion: ffmpegResult.version,
    ffprobeVersion: ffprobeResult.version,
    source
  };
};
