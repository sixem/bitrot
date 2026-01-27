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
  // MPEG-4 Part 2 caps keyint near 600; anything above is wasted.
  gopSize: 600,
  seed: 0
};
