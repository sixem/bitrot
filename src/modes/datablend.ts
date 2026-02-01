import type { ModeConfigField } from "@/modes/configFields";

// Data-blend filter chain for glitchy temporal blending.
export type DatablendBlendMode = "difference" | "screen" | "multiply" | "overlay";

export type DatablendConfig = {
  intensity: number;
  trail: number;
  blendMode: DatablendBlendMode;
};

export const defaultDatablendConfig: DatablendConfig = {
  intensity: 45,
  trail: 25,
  blendMode: "overlay"
};

// Mode browser config metadata for datablend defaults.
export const datablendConfigFields: ModeConfigField<DatablendConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Overall strength of the blended frame stack."
  },
  {
    key: "trail",
    label: "Trail",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "How long ghost trails persist between frames."
  },
  {
    key: "blendMode",
    label: "Blend mode",
    kind: "select",
    options: [
      { value: "difference", label: "Difference" },
      { value: "screen", label: "Screen" },
      { value: "multiply", label: "Multiply" },
      { value: "overlay", label: "Overlay" }
    ],
    description: "How the temporal frames mix together."
  }
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toFixed = (value: number, digits = 2) => value.toFixed(digits);

const buildTmixWeights = (frames: number, intensity: number, trail: number) => {
  const baseWeight = 0.2 + trail * 0.4;
  const currentWeight = 1.6 + intensity * 1.4;
  const weights = Array.from({ length: frames }, (_, index) =>
    index === frames - 1 ? currentWeight : baseWeight
  );
  return weights.map((weight) => weight.toFixed(2)).join(" ");
};

// Builds a temporal blend that stays glitchy without destroying the whole frame.
export const buildDatablendFilter = (config: DatablendConfig) => {
  const intensity = clamp(config.intensity, 0, 100) / 100;
  const trail = clamp(config.trail, 0, 100) / 100;
  const frames = Math.round(2 + trail * 2);
  const weights = buildTmixWeights(frames, intensity, trail);

  const opacity = toFixed(0.12 + intensity * 0.35);
  const chroma = Math.round(1 + intensity * 2);
  const contrast = toFixed(1.0 + intensity * 0.12);
  const saturation = toFixed(1.0 + intensity * 0.18);
  const noise = Math.round(2 + intensity * 6);

  return [
    `tmix=frames=${frames}:weights='${weights}'`,
    `tblend=all_mode=${config.blendMode}:all_opacity=${opacity}`,
    `chromashift=cbh=${chroma}:cbv=${chroma}:crh=${-chroma}:crv=${-chroma}`,
    `noise=alls=${noise}:allf=t+u`,
    `eq=contrast=${contrast}:saturation=${saturation}`
  ].join(",");
};
