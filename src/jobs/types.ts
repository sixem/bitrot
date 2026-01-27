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
};

export type JobState = {
  status: JobStatus;
  progress: JobProgress;
  outputPath?: string;
  error?: string;
};
