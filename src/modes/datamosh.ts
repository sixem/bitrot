// Classic datamosh configuration and helpers for scene-based I-frame removal.
export type DatamoshConfig = {
  intensity: number;
  moshLengthSeconds: number;
  sceneThreshold: number;
  gopSize: number;
  seed: number;
};

export const defaultDatamoshConfig: DatamoshConfig = {
  // Balanced defaults that hit most clips without immediate blowouts.
  intensity: 75,
  moshLengthSeconds: 0,
  sceneThreshold: 0.3,
  // Shorter GOP gives tighter, choppier mosh bursts by default.
  gopSize: 15,
  seed: 0
};
