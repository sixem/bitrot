import type { ModeConfigField } from "@/modes/configFields";

// Pixel sort configuration. The heavy lifting happens in the Rust pipeline.
export type PixelsortDirection = "horizontal" | "vertical" | "block";

export type PixelsortConfig = {
  intensity: number;
  threshold: number;
  maxThreshold: number;
  blockSize: number;
  direction: PixelsortDirection;
};

export const defaultPixelsortConfig: PixelsortConfig = {
  intensity: 100,
  threshold: 50,
  maxThreshold: 110,
  blockSize: 4,
  direction: "vertical"
};

// Mode browser config metadata for pixelsort defaults.
export const pixelsortConfigFields: ModeConfigField<PixelsortConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "How aggressive the sorting pass feels overall."
  },
  {
    key: "threshold",
    label: "Min threshold",
    kind: "range",
    min: 0,
    max: 255,
    description: "Lower bound of brightness to start sorting."
  },
  {
    key: "maxThreshold",
    label: "Max threshold",
    kind: "range",
    min: 0,
    max: 255,
    description: "Upper bound of brightness to keep sorting active."
  },
  {
    key: "blockSize",
    label: "Block size",
    kind: "range",
    min: 2,
    max: 120,
    unit: "px",
    description: "Size of each sorting block."
  },
  {
    key: "direction",
    label: "Direction",
    kind: "select",
    options: [
      { value: "horizontal", label: "Horizontal" },
      { value: "vertical", label: "Vertical" },
      { value: "block", label: "Block" }
    ],
    description: "Primary axis for the sorting pass."
  }
];
