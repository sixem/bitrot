import type { TrimSelectionState } from "@/editor/useTrimSelection";

// Pure helpers for trim selection state so the hook stays readable and testable.

type TrimFlags = {
  trimHasRange: boolean;
  trimEnabled: boolean;
};

export const getTrimSelectionFlags = (
  selection?: TrimSelectionState
): TrimFlags => {
  const trimHasRange =
    !!selection?.isValid &&
    typeof selection.start === "number" &&
    typeof selection.end === "number";
  const trimEnabled = !!selection?.enabled && trimHasRange;

  return { trimHasRange, trimEnabled };
};

type TrimInfoLinesArgs = {
  hasTrim: boolean;
  selection?: TrimSelectionState;
  trimHasRange: boolean;
  trimLengthFrames?: number;
  formatTimeWithFrame: (timeSeconds?: number, frameOverride?: number) => string;
};

export const buildTrimInfoLines = ({
  hasTrim,
  selection,
  trimHasRange,
  trimLengthFrames,
  formatTimeWithFrame
}: TrimInfoLinesArgs): string[] => {
  if (!hasTrim) {
    return [];
  }

  if (trimHasRange) {
    return [
      `In ${formatTimeWithFrame(selection?.start)}`,
      `Out ${formatTimeWithFrame(selection?.end)}`,
      `Len ${formatTimeWithFrame(selection?.lengthSeconds, trimLengthFrames)}`
    ];
  }

  if (selection?.start !== undefined) {
    return [`Start ${formatTimeWithFrame(selection.start)}`, "Awaiting end"];
  }

  if (selection?.end !== undefined) {
    return [`End ${formatTimeWithFrame(selection.end)}`, "Awaiting start"];
  }

  return ["No selection"];
};
