// Normalizes size-cap selection state for the export modal.
import { useEffect, useMemo, useState } from "react";

type SizeCapOption = {
  mb: number;
  kb: number;
};

type SizeCapSelectionArgs = {
  sizeCapMb?: number;
  sizeCapOptions: SizeCapOption[];
  onSizeCapChange: (nextSizeCapMb?: number) => void;
};

const useSizeCapSelection = ({
  sizeCapMb,
  sizeCapOptions,
  onSizeCapChange
}: SizeCapSelectionArgs) => {
  const normalizedSizeCapMb =
    typeof sizeCapMb === "number" && Number.isFinite(sizeCapMb) && sizeCapMb > 0
      ? sizeCapMb
      : undefined;
  const sizeCapPreset = useMemo(
    () =>
      normalizedSizeCapMb !== undefined
        ? sizeCapOptions.find(
            (option) => Math.round(normalizedSizeCapMb * 1024) === option.kb
          )
        : undefined,
    [normalizedSizeCapMb, sizeCapOptions]
  );
  const defaultCustomSizeCap = sizeCapOptions[0]?.kb ?? 5120;
  const [customSizeCapValue, setCustomSizeCapValue] = useState(() => {
    if (normalizedSizeCapMb !== undefined) {
      return String(Math.round(normalizedSizeCapMb * 1024));
    }
    return String(defaultCustomSizeCap);
  });
  const [isCustomSizeCap, setIsCustomSizeCap] = useState(
    normalizedSizeCapMb !== undefined && !sizeCapPreset
  );
  const sizeCapSelection = isCustomSizeCap
    ? "custom"
    : sizeCapPreset
      ? String(sizeCapPreset.kb)
      : normalizedSizeCapMb !== undefined
        ? "custom"
      : "off";

  useEffect(() => {
    if (normalizedSizeCapMb === undefined) {
      setIsCustomSizeCap(false);
      return;
    }
    if (sizeCapPreset) {
      setIsCustomSizeCap(false);
      return;
    }
    setCustomSizeCapValue(String(Math.round(normalizedSizeCapMb * 1024)));
    setIsCustomSizeCap(true);
  }, [normalizedSizeCapMb, sizeCapPreset]);

  const sizeCapSelectOptions = [
    { value: "off", label: "Off" },
    ...sizeCapOptions.map((option) => ({
      value: String(option.kb),
      label: `${option.kb} KB`
    }))
  ];

  const customSizeCapLabel = customSizeCapValue
    ? `Custom - ${customSizeCapValue} KB`
    : "Custom";

  const handleCustomCommit = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setIsCustomSizeCap(true);
    onSizeCapChange(parsed / 1024);
  };

  const handleSizeCapChange = (nextValue: string) => {
    if (nextValue === "off") {
      setIsCustomSizeCap(false);
      onSizeCapChange(undefined);
      return;
    }
    if (nextValue === "custom") {
      const parsed = Number.parseFloat(customSizeCapValue);
      const fallback = normalizedSizeCapMb ?? (sizeCapOptions[0]?.mb ?? 5);
      setIsCustomSizeCap(true);
      onSizeCapChange(
        Number.isFinite(parsed) && parsed > 0 ? parsed / 1024 : fallback
      );
      return;
    }
    const parsed = Number.parseFloat(nextValue);
    setIsCustomSizeCap(false);
    onSizeCapChange(Number.isFinite(parsed) ? parsed / 1024 : undefined);
  };

  return {
    sizeCapSelection,
    sizeCapSelectOptions,
    customSizeCapLabel,
    customSizeCapValue,
    setCustomSizeCapValue,
    customInputActive: sizeCapSelection === "custom",
    handleCustomCommit,
    handleSizeCapChange
  };
};

export default useSizeCapSelection;
