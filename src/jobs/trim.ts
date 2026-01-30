// Shared trim normalization for export jobs.

export type TrimRange = {
  start: number;
  end: number;
};

type NormalizeTrimOptions = {
  durationSeconds?: number;
};

export const normalizeTrimRange = (
  start?: number,
  end?: number,
  options: NormalizeTrimOptions = {}
): TrimRange | undefined => {
  if (typeof start !== "number" || typeof end !== "number") {
    return undefined;
  }
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(0, end);
  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd)) {
    return undefined;
  }
  const durationSeconds = options.durationSeconds;
  const clampedEnd =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? Math.min(safeEnd, durationSeconds)
      : safeEnd;
  if (clampedEnd <= safeStart) {
    return undefined;
  }
  return { start: safeStart, end: clampedEnd };
};
