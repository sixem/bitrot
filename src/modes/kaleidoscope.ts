import type { ModeConfigField } from "@/modes/configFields";

// Kaleidoscope configuration for the native symmetry pipeline.
export type KaleidoscopeConfig = {
  sectors: number;
  rotationDegrees: number;
  centerX: number;
  centerY: number;
  intensity: number;
};

export const defaultKaleidoscopeConfig: KaleidoscopeConfig = {
  sectors: 6,
  rotationDegrees: 0,
  centerX: 0.5,
  centerY: 0.5,
  intensity: 80
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

// Mode browser config metadata for kaleidoscope defaults.
export const kaleidoscopeConfigFields: ModeConfigField<KaleidoscopeConfig>[] = [
  {
    key: "sectors",
    label: "Sectors",
    kind: "range",
    min: 2,
    max: 16,
    step: 1,
    description: "Number of mirrored wedges around the center."
  },
  {
    key: "rotationDegrees",
    label: "Rotation",
    kind: "range",
    min: -180,
    max: 180,
    step: 1,
    unit: "°",
    description: "Rotates the symmetry axis around the center."
  },
  {
    key: "centerX",
    label: "Center X",
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
    formatValue: formatPercent,
    description: "Horizontal origin of the kaleidoscope."
  },
  {
    key: "centerY",
    label: "Center Y",
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
    formatValue: formatPercent,
    description: "Vertical origin of the kaleidoscope."
  },
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Blends between the original frame and full symmetry."
  }
];
