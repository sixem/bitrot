import type { ModeConfigField } from "@/modes/configFields";

// Block shift configuration for native macroblock displacement.

export type BlockShiftConfig = {
  // Size of the displacement tiles in pixels (8 or 16 are classic).
  blockSize: number;
  // Maximum pixel offset per block (applied in both axes).
  maxOffset: number;
  // Quantize offsets to multiples of this value for chunky steps.
  offsetStep: number;
  // Blend strength (0-100) between original and shifted pixels.
  intensity: number;
  // Seed for deterministic per-block offsets.
  seed: number;
};

export const defaultBlockShiftConfig: BlockShiftConfig = {
  blockSize: 16,
  maxOffset: 24,
  offsetStep: 8,
  intensity: 80,
  seed: 1337
};

// Mode browser config metadata for block shift defaults.
export const blockShiftConfigFields: ModeConfigField<BlockShiftConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Blend between the original and shifted blocks."
  },
  {
    key: "blockSize",
    label: "Block size",
    kind: "range",
    min: 4,
    max: 64,
    step: 4,
    unit: "px",
    description: "Tile size used for displacement."
  },
  {
    key: "maxOffset",
    label: "Max offset",
    kind: "range",
    min: 0,
    max: 64,
    unit: "px",
    description: "Maximum pixel shift per block."
  },
  {
    key: "offsetStep",
    label: "Offset step",
    kind: "range",
    min: 1,
    max: 32,
    unit: "px",
    description: "Quantizes offsets to multiples of this value."
  },
  {
    key: "seed",
    label: "Seed",
    kind: "number",
    min: 0,
    max: 9999,
    step: 1,
    description: "Repeatable random seed for the displacement pattern."
  }
];
