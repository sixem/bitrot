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
