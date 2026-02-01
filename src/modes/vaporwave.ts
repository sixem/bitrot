import type { ModeConfigField } from "@/modes/configFields";

// Vaporwave palette remap configuration for the native mode.

export type VaporwaveConfig = {
  // Blend between original and remapped colors (0-100).
  intensity: number;
  // Inclusive cutoff for near-black pixels (per-channel).
  blackThreshold: number;
  // Upper bound for the cyan band (per-channel).
  cyanMax: number;
  // Upper bound for the magenta band (per-channel).
  magentaMax: number;
  // Upper bound for the purple band (per-channel).
  purpleMax: number;
  // Upper bound for the teal band (per-channel).
  tealMax: number;
  // Inclusive cutoff for near-white pixels (per-channel).
  whiteThreshold: number;
};

export const defaultVaporwaveConfig: VaporwaveConfig = {
  // Defaults mirror the original imagerot vaporwave thresholds.
  intensity: 100,
  blackThreshold: 15,
  cyanMax: 60,
  magentaMax: 120,
  purpleMax: 180,
  tealMax: 234,
  whiteThreshold: 235
};

// Mode browser config metadata for vaporwave defaults.
export const vaporwaveConfigFields: ModeConfigField<VaporwaveConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Blend between the original colors and the vaporwave palette."
  },
  {
    key: "blackThreshold",
    label: "Black cutoff",
    kind: "range",
    min: 0,
    max: 255,
    description: "Pixels below this value stay black."
  },
  {
    key: "cyanMax",
    label: "Cyan band max",
    kind: "range",
    min: 0,
    max: 255,
    description: "Upper bound for the cyan band."
  },
  {
    key: "magentaMax",
    label: "Magenta band max",
    kind: "range",
    min: 0,
    max: 255,
    description: "Upper bound for the magenta band."
  },
  {
    key: "purpleMax",
    label: "Purple band max",
    kind: "range",
    min: 0,
    max: 255,
    description: "Upper bound for the purple band."
  },
  {
    key: "tealMax",
    label: "Teal band max",
    kind: "range",
    min: 0,
    max: 255,
    description: "Upper bound for the teal band."
  },
  {
    key: "whiteThreshold",
    label: "White cutoff",
    kind: "range",
    min: 0,
    max: 255,
    description: "Pixels above this value clamp to white."
  }
];
