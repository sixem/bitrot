// Central registry for cleaning temp outputs produced by job runners.
import { getModeDefinition, type ModeId } from "@/modes/definitions";
import { splitOutputPath, joinOutputPath } from "@/jobs/output";
import { getDatamoshTempPaths } from "@/jobs/datamoshRunner";
import { cleanupFiles } from "@/system/cleanup";
import makeDebug from "@/utils/debug";

type CleanupEntry = {
  outputPath: string;
  tempPaths: string[];
  preserveOutput: boolean;
};

const debug = makeDebug("jobs:cleanup");
const activeEntries = new Map<string, CleanupEntry>();

const buildNativeTempPath = (outputPath: string, tag: string) => {
  const { folder, fileName, separator } = splitOutputPath(outputPath);
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName || "native";
  const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1) : "mp4";
  const safeTag = tag.replace(/[^a-z0-9-]+/gi, "-");
  const tempFile = `${stem}.${safeTag}.video.${extension}`;
  return joinOutputPath(folder, tempFile, separator);
};

const buildCleanupEntry = (outputPath: string, modeId?: ModeId): CleanupEntry => {
  const tempPaths: string[] = [];
  const mode = getModeDefinition(modeId);
  if (mode.runner === "datamosh") {
    const temps = getDatamoshTempPaths(outputPath);
    tempPaths.push(temps.tempPath, temps.rawPath, temps.moshedPath, temps.remuxPath);
  } else if (mode.runner === "pixelsort") {
    tempPaths.push(buildNativeTempPath(outputPath, "pixelsort"));
  } else if (mode.runner === "modulo-mapping") {
    tempPaths.push(buildNativeTempPath(outputPath, "modulo-mapping"));
  }

  return {
    outputPath,
    tempPaths: tempPaths.filter(Boolean),
    preserveOutput: false
  };
};

const cleanupPaths = async (paths: string[]) => {
  const success = await cleanupFiles(paths, "job cleanup");
  if (!success) {
    debug("cleanup failed");
  }
  return success;
};

export const registerJobCleanup = (outputPath: string, modeId?: ModeId) => {
  const trimmed = outputPath.trim();
  if (!trimmed) {
    return null;
  }
  const entry = buildCleanupEntry(trimmed, modeId);
  activeEntries.set(trimmed, entry);
  return entry;
};

export const cleanupJob = async (
  outputPath: string,
  options: { keepOutput?: boolean }
) => {
  const entry = activeEntries.get(outputPath.trim());
  if (!entry) {
    return;
  }
  const keepOutput = options.keepOutput ?? false;
  const paths = keepOutput
    ? entry.tempPaths
    : [entry.outputPath, ...entry.tempPaths];
  const success = await cleanupPaths(paths);
  if (keepOutput) {
    if (success) {
      activeEntries.delete(entry.outputPath);
    } else {
      entry.preserveOutput = true;
    }
    return;
  }
  if (success) {
    activeEntries.delete(entry.outputPath);
  }
};

export const cleanupAllJobs = async () => {
  const entries = [...activeEntries.values()];
  activeEntries.clear();
  const paths = entries.flatMap((entry) =>
    entry.preserveOutput
      ? entry.tempPaths
      : [entry.outputPath, ...entry.tempPaths]
  );
  await cleanupPaths(paths);
};

export const hasActiveJobs = () => activeEntries.size > 0;
