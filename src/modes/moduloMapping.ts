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
