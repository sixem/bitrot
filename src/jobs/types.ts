// Job and progress types shared across the processing flow.
export type JobStatus = "idle" | "running" | "success" | "error" | "canceled";

export type JobProgress = {
  percent: number;
  frame?: number;
  fps?: number;
  speed?: number;
  bitrate?: string;
  outTimeSeconds?: number;
  totalSizeBytes?: number;
  elapsedSeconds?: number;
  etaSeconds?: number;
};

export type JobState = {
  status: JobStatus;
  progress: JobProgress;
  outputPath?: string;
  // Optional runner-provided id for scoping event streams (e.g. pixelsort previews).
  jobId?: string;
  error?: string;
};
