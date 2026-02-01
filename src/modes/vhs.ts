import type { ModeConfigField } from "@/modes/configFields";

// VHS-style filter chain for analog tape artifacts.
export type VhsConfig = {
  intensity: number;
  tracking: number;
  chromaShift: number;
  noise: number;
  smear: number;
};

export const defaultVhsConfig: VhsConfig = {
  intensity: 60,
  tracking: 45,
  chromaShift: 3,
  noise: 14,
  smear: 10
};

// Mode browser config metadata for VHS defaults.
export const vhsConfigFields: ModeConfigField<VhsConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Overall mix of tape wear, color shift, and grit."
  },
  {
    key: "tracking",
    label: "Tracking",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Adds horizontal wobble and scanline drift."
  },
  {
    key: "chromaShift",
    label: "Chroma bleed",
    kind: "range",
    min: 0,
    max: 8,
    unit: "px",
    description: "Offsets color channels for classic VHS bleed."
  },
  {
    key: "noise",
    label: "Noise",
    kind: "range",
    min: 0,
    max: 40,
    description: "Static and grain strength layered over the frame."
  },
  {
    key: "smear",
    label: "Softness",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Adds blur and softness to mimic tape blur."
  }
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toFixed = (value: number, digits = 2) => value.toFixed(digits);

// Builds a VHS-inspired filter chain that keeps controls readable and robust.
export const buildVhsFilter = (config: VhsConfig) => {
  const intensity = clamp(config.intensity, 0, 100) / 100;
  const tracking = clamp(config.tracking, 0, 100) / 100;
  const softness = clamp(config.smear, 0, 100) / 100;
  const noiseStrength = clamp(config.noise, 0, 40);
  const chroma = Math.round(clamp(config.chromaShift, 0, 8));

  const contrast = toFixed(1.05 + intensity * 0.25);
  const saturation = toFixed(0.9 + intensity * 0.55);
  const brightness = toFixed(-0.02 + intensity * 0.05);

  const lumaScale = toFixed(0.65 + tracking * 0.9 + softness * 0.45);
  const chromaScale = toFixed(1.0 + tracking * 1.15 + softness * 0.55);
  const lumaBlur = `max(1\\,min(2\\,(min(w\\,h)/720)*${lumaScale}))`;
  const chromaBlur = `max(1\\,min(3\\,(min(w\\,h)/720)*${chromaScale}))`;

  const scanlineAlpha = toFixed(Math.min(0.28, 0.04 + tracking * 0.18 + intensity * 0.04));
  return [
    `eq=contrast=${contrast}:saturation=${saturation}:brightness=${brightness}`,
    `boxblur=luma_radius=${lumaBlur}:luma_power=1:chroma_radius=${chromaBlur}:chroma_power=1`,
    `chromashift=cbh=${chroma}:cbv=${chroma}:crh=${-chroma}:crv=${-chroma}`,
    `noise=alls=${noiseStrength}:allf=t+u`,
    `drawgrid=width=iw:height=max(2\\,ih/360):thickness=max(1\\,ih/1080):color=black@${scanlineAlpha}`
  ].join(",");
};
