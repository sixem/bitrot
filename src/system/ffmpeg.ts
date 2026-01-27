import { Command } from "@tauri-apps/plugin-shell";

export type FfmpegStatus = {
  state: "checking" | "ready" | "missing";
  message: string;
  details?: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
};

const FFMPEG_SIDECAR = "binaries/ffmpeg";
const FFPROBE_SIDECAR = "binaries/ffprobe";

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

const runSidecar = async (name: string, expectedPrefix: string) => {
  try {
    const command = Command.sidecar(name, ["-version"]);
    const output = await command.execute();
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
      version: versionLine || getFirstLine(combinedOutput)
    } as const;
  } catch (error) {
    return { ok: false, error: formatError(error) } as const;
  }
};

export const checkFfmpegSidecars = async (): Promise<FfmpegStatus> => {
  const [ffmpegResult, ffprobeResult] = await Promise.all([
    runSidecar(FFMPEG_SIDECAR, "ffmpeg version"),
    runSidecar(FFPROBE_SIDECAR, "ffprobe version")
  ]);

  if (!ffmpegResult.ok || !ffprobeResult.ok) {
    return {
      state: "missing",
      message:
        "FFmpeg sidecar binaries are missing or failed to launch. Install them to continue.",
      details: [
        !ffmpegResult.ok ? `ffmpeg: ${ffmpegResult.error}` : null,
        !ffprobeResult.ok ? `ffprobe: ${ffprobeResult.error}` : null
      ]
        .filter(Boolean)
        .join(" | ")
    };
  }

  return {
    state: "ready",
    message: "FFmpeg is ready.",
    ffmpegVersion: ffmpegResult.version,
    ffprobeVersion: ffprobeResult.version
  };
};
