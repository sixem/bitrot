// Output path helpers for export defaults and UI display.
import type { ExportFormat } from "@/jobs/exportProfile";

const stripQuotes = (value: string) => value.trim().replace(/^"+|"+$/g, "");

const getSeparator = (path: string) => (path.includes("\\") ? "\\" : "/");

// Normalizes paths for comparisons without hitting the filesystem.
const normalizePathForCompare = (value: string) =>
  stripQuotes(value).replace(/[/\\]+/g, "/").replace(/\/+$/, "");

const isLikelyWindows = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.userAgent === "string" &&
  navigator.userAgent.toLowerCase().includes("windows");

export type OutputPathParts = {
  folder: string;
  fileName: string;
  separator: string;
};

export const buildDefaultOutputPath = (
  inputPath: string,
  forcedExtension?: string
) => {
  const cleanPath = stripQuotes(inputPath);
  const separator = getSeparator(cleanPath);
  const parts = cleanPath.split(/[/\\]/);
  const fileName = parts.pop() ?? cleanPath;
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const normalizedExtension = forcedExtension
    ? forcedExtension.startsWith(".")
      ? forcedExtension
      : `.${forcedExtension}`
    : null;
  const extension =
    normalizedExtension ?? (dotIndex > 0 ? fileName.slice(dotIndex) : ".mp4");
  const outputName = `${baseName}.bitrot${extension}`;

  if (parts.length === 0) {
    return outputName;
  }

  return `${parts.join(separator)}${separator}${outputName}`;
};

// Splits a full output path into folder + filename segments.
export const splitOutputPath = (outputPath: string): OutputPathParts => {
  const cleanPath = stripQuotes(outputPath);
  const separator = getSeparator(cleanPath);
  const parts = cleanPath.split(/[/\\]/);
  const fileName = parts.pop() ?? "";
  const folder = parts.length > 0 ? parts.join(separator) : "";

  return {
    folder,
    fileName,
    separator
  };
};

// Joins folder + filename into a single path for export.
export const joinOutputPath = (
  folder: string,
  fileName: string,
  separator: string
) => {
  const cleanFolder = stripQuotes(folder).replace(/[/\\]+$/, "");
  const cleanFile = stripQuotes(fileName);

  if (!cleanFolder) {
    return cleanFile;
  }

  return `${cleanFolder}${separator}${cleanFile}`;
};

// Ensures a filename ends with the provided extension.
export const replaceExtension = (fileName: string, extension: string) => {
  const cleanFile = stripQuotes(fileName);
  if (!cleanFile) {
    return cleanFile;
  }
  const normalizedExtension = extension.startsWith(".")
    ? extension
    : `.${extension}`;
  const dotIndex = cleanFile.lastIndexOf(".");
  if (dotIndex <= 0) {
    return `${cleanFile}${normalizedExtension}`;
  }
  return `${cleanFile.slice(0, dotIndex)}${normalizedExtension}`;
};

export const resolveExtensionForFormat = (format: ExportFormat) => format;

// Compares two paths, with a case-insensitive match on Windows.
export const pathsMatch = (left: string, right: string) => {
  const normalizedLeft = normalizePathForCompare(left);
  const normalizedRight = normalizePathForCompare(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (isLikelyWindows()) {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
};

// Builds a temporary output path next to the final output file.
export const buildTempOutputPath = (
  outputPath: string,
  label: string
): string => {
  const { folder, fileName, separator } = splitOutputPath(outputPath);
  if (!fileName) {
    return outputPath;
  }
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1) : "mp4";
  const tempFile = `${baseName}.${label}.${extension}`;

  return joinOutputPath(folder, tempFile, separator);
};
