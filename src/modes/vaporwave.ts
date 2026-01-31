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
