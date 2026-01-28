// Pixel sort configuration. The heavy lifting happens in the Rust pipeline.
export type PixelsortDirection = "horizontal" | "vertical" | "block";

export type PixelsortConfig = {
  intensity: number;
  threshold: number;
  maxThreshold: number;
  blockSize: number;
  direction: PixelsortDirection;
  noise: number;
};

export const defaultPixelsortConfig: PixelsortConfig = {
  intensity: 100,
  threshold: 50,
  maxThreshold: 200,
  blockSize: 4,
  direction: "vertical",
  noise: 5
};
