import type { ModeConfigField } from "@/modes/configFields";

// Modulo mapping configuration for native frame corruption.

export type ModuloMappingConfig = {
  // Size of each block in pixels (acts like a macroblock size).
  modulus: number;
  // Step size used when snapping offsets.
  stride: number;
  // Maximum pixel offset applied inside each block.
  offset: number;
  // Blend strength (0-100) between original and remapped pixels.
  intensity: number;
};

export const defaultModuloMappingConfig: ModuloMappingConfig = {
  modulus: 64,
  stride: 3,
  offset: 7,
  intensity: 55
};

// Mode browser config metadata for modulo mapping defaults.
export const moduloMappingConfigFields: ModeConfigField<ModuloMappingConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Blend between original and remapped pixels."
  },
  {
    key: "modulus",
    label: "Block size",
    kind: "range",
    min: 2,
    max: 256,
    description: "Grid cell size used for remapping."
  },
  {
    key: "stride",
    label: "Offset step",
    kind: "range",
    min: 1,
    max: 32,
    description: "Snaps offsets to fixed steps for chunkier motion."
  },
  {
    key: "offset",
    label: "Max offset",
    kind: "range",
    min: 0,
    max: 255,
    description: "Maximum pixel shift within each block."
  }
];
