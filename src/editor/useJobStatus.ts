// Derives progress labels and convenience flags for the processing card.
import { useMemo } from "react";
import type { JobState } from "@/jobs/types";

type JobStatusArgs = {
  job: JobState;
  outputPath: string;
  trimStartSeconds?: number;
};

type JobStatusSummary = {
  jobStatusLabel: string;
  progressPercent: number;
  outTimeSeconds?: number;
  totalSizeBytes?: number;
  elapsedSeconds?: number;
  etaSeconds?: number;
  renderTimeSeconds?: number;
  canRevealOutput: boolean;
  isExportDisabled: boolean;
};

// Derived values for the processing card + preview timeline.
const useJobStatus = ({
  job,
  outputPath,
  trimStartSeconds
}: JobStatusArgs): JobStatusSummary => {
  const canRevealOutput =
    job.status === "success" && outputPath.trim().length > 0;

  const jobStatusLabel = useMemo(() => {
    if (job.status === "running") {
      return "Running";
    }
    if (job.status === "success") {
      return "Complete";
    }
    if (job.status === "error") {
      return "Failed";
    }
    if (job.status === "canceled") {
      return "Canceled";
    }
    return "Idle";
  }, [job.status]);

  const progressPercent = Number.isFinite(job.progress.percent)
    ? job.progress.percent
    : 0;

  const outTimeSeconds =
    typeof job.progress.outTimeSeconds === "number" &&
    Number.isFinite(job.progress.outTimeSeconds)
      ? job.progress.outTimeSeconds
      : undefined;
  const totalSizeBytes =
    typeof job.progress.totalSizeBytes === "number" &&
    Number.isFinite(job.progress.totalSizeBytes)
      ? job.progress.totalSizeBytes
      : undefined;
  const elapsedSeconds =
    typeof job.progress.elapsedSeconds === "number" &&
    Number.isFinite(job.progress.elapsedSeconds)
      ? job.progress.elapsedSeconds
      : undefined;
  const etaSeconds =
    typeof job.progress.etaSeconds === "number" &&
    Number.isFinite(job.progress.etaSeconds)
      ? job.progress.etaSeconds
      : undefined;

  const renderTimeSeconds =
    job.status === "running" && outTimeSeconds !== undefined
      ? trimStartSeconds !== undefined
        ? trimStartSeconds + outTimeSeconds
        : outTimeSeconds
      : undefined;

  const isExportDisabled = job.status === "running";

  return {
    jobStatusLabel,
    progressPercent,
    outTimeSeconds,
    totalSizeBytes,
    elapsedSeconds,
    etaSeconds,
    renderTimeSeconds,
    canRevealOutput,
    isExportDisabled
  };
};

export default useJobStatus;
