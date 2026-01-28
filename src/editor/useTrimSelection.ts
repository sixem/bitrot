import { useCallback, useEffect, useMemo, useState } from "react";

export type TrimSelectionState = {
  start?: number;
  end?: number;
  enabled: boolean;
  isValid: boolean;
  lengthSeconds?: number;
};

type TrimSelectionOptions = {
  durationSeconds?: number;
  resetKey?: string;
};

const MIN_RANGE_SECONDS = 0.01;

const clampTime = (value: number, duration?: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (!Number.isFinite(duration)) {
    return Math.max(0, value);
  }
  return Math.min(Math.max(0, value), Math.max(0, duration ?? 0));
};

const normalizeRange = (
  start: number | undefined,
  end: number | undefined,
  duration?: number
) => {
  let nextStart = typeof start === "number" ? clampTime(start, duration) : undefined;
  let nextEnd = typeof end === "number" ? clampTime(end, duration) : undefined;

  if (nextStart !== undefined && nextEnd !== undefined && nextEnd < nextStart) {
    const temp = nextStart;
    nextStart = nextEnd;
    nextEnd = temp;
  }

  return { start: nextStart, end: nextEnd };
};

const isValidRange = (start?: number, end?: number) => {
  if (start === undefined || end === undefined) {
    return false;
  }
  return end - start >= MIN_RANGE_SECONDS;
};

// Manages a non-intrusive trim selection state for export ranges.
const useTrimSelection = ({ durationSeconds, resetKey }: TrimSelectionOptions) => {
  const [start, setStart] = useState<number | undefined>(undefined);
  const [end, setEnd] = useState<number | undefined>(undefined);
  const [enabled, setEnabled] = useState(false);

  const applyRange = useCallback(
    (
      nextStart: number | undefined,
      nextEnd: number | undefined,
      autoEnable: boolean
    ) => {
      const normalized = normalizeRange(nextStart, nextEnd, durationSeconds);
      const valid = isValidRange(normalized.start, normalized.end);
      setStart(normalized.start);
      setEnd(normalized.end);
      if (autoEnable) {
        setEnabled(valid);
      } else if (!valid) {
        setEnabled(false);
      }
    },
    [durationSeconds]
  );

  const markIn = useCallback(
    (timeSeconds: number) => {
      applyRange(timeSeconds, end, true);
    },
    [applyRange, end]
  );

  const markOut = useCallback(
    (timeSeconds: number) => {
      applyRange(start, timeSeconds, true);
    },
    [applyRange, start]
  );

  const clear = useCallback(() => {
    setStart(undefined);
    setEnd(undefined);
    setEnabled(false);
  }, []);

  const toggleEnabled = useCallback(() => {
    if (!isValidRange(start, end)) {
      return;
    }
    setEnabled((value) => !value);
  }, [start, end]);

  useEffect(() => {
    applyRange(start, end, false);
  }, [applyRange, start, end, durationSeconds]);

  useEffect(() => {
    if (!resetKey) {
      return;
    }
    setStart(undefined);
    setEnd(undefined);
    setEnabled(false);
  }, [resetKey]);

  const isValid = isValidRange(start, end);
  const lengthSeconds = isValid && start !== undefined && end !== undefined ? end - start : undefined;

  const selection = useMemo(
    () => ({
      start,
      end,
      enabled,
      isValid,
      lengthSeconds
    }),
    [enabled, end, isValid, lengthSeconds, start]
  );

  return {
    selection,
    markIn,
    markOut,
    clear,
    toggleEnabled
  };
};

export default useTrimSelection;
