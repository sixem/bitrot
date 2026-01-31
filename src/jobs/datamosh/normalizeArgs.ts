// Builders for the normalization step of the datamosh pipeline.
import {
  buildAudioArgs,
  buildContainerArgs,
  getExtension
} from "@/jobs/ffmpegArgs";
import type { TrimRange } from "@/jobs/trim";

const buildTrimArgs = (trim?: TrimRange) => {
  if (!trim) {
    return [];
  }
  return ["-ss", trim.start.toFixed(3), "-to", trim.end.toFixed(3)];
};

const ensureDatamoshContainer = (outputPath: string) => {
  const extension = getExtension(outputPath);
  if (
    extension === "mp4" ||
    extension === "m4v" ||
    extension === "mkv" ||
    extension === "mov" ||
    extension === "webm"
  ) {
    return;
  }
  throw new Error(
    `Datamosh output must be .mp4, .mkv, .mov, or .webm (got .${
      extension || "unknown"
    }).`
  );
};

const buildNormalizeArgs = (
  inputPath: string,
  outputPath: string,
  gopSize: number,
  forceKeyframes: number[],
  trim?: TrimRange
) => {
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    ...buildTrimArgs(trim),
    // Some files have multiple video streams; always pick the first real video track.
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "mpeg4",
    "-qscale:v",
    "2",
    "-g",
    `${gopSize}`,
    "-bf",
    "0",
    "-pix_fmt",
    "yuv420p"
  ];

  if (forceKeyframes.length > 0) {
    const keyframeList = forceKeyframes.map((time) => time.toFixed(3)).join(",");
    args.push("-force_key_frames", keyframeList);
  }

  args.push(...buildAudioArgs(outputPath), ...buildContainerArgs(outputPath), outputPath);
  return args;
};

export { buildTrimArgs, ensureDatamoshContainer, buildNormalizeArgs };
