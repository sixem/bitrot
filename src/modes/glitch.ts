// Configurable glitch filter chain for stronger digital artifacts.
export type GlitchConfig = {
  intensity: number;
  chromaShift: number;
  noise: number;
};

export const defaultGlitchConfig: GlitchConfig = {
  intensity: 55,
  chromaShift: 4,
  noise: 18
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toFixed = (value: number, digits = 2) => value.toFixed(digits);

export const buildGlitchFilter = (config: GlitchConfig) => {
  const intensity = clamp(config.intensity, 0, 100) / 100;
  const noiseStrength = clamp(config.noise, 0, 40);
  const chroma = Math.round(clamp(config.chromaShift, 0, 8));
  const contrast = toFixed(1 + intensity * 0.45);
  const saturation = toFixed(1 + intensity * 0.8);
  const decay = toFixed(0.98 - intensity * 0.12);

  return [
    `noise=alls=${noiseStrength}:allf=t+u`,
    `chromashift=cbh=${chroma}:cbv=${chroma}:crh=${-chroma}:crv=${-chroma}`,
    `lagfun=decay=${decay}:planes=0x3`,
    `eq=contrast=${contrast}:saturation=${saturation}`
  ].join(",");
};
