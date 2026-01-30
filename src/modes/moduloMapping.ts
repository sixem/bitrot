// Modulo mapping configuration for native frame corruption.

export type ModuloMappingConfig = {
  // Size of each repeat block (in pixels).
  modulus: number;
  // Step size for the modular index mapping.
  stride: number;
  // Offset added to each modular index (jittered by seed + frame).
  offset: number;
  // Blend strength (0-100) between original and remapped pixels.
  intensity: number;
  // Seed for per-frame offset jitter.
  seed: number;
};

export const defaultModuloMappingConfig: ModuloMappingConfig = {
  modulus: 64,
  stride: 3,
  offset: 7,
  intensity: 55,
  seed: 1337
};
