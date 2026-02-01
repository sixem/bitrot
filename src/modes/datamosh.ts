import type { ModeConfigField } from "@/modes/configFields";

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
  intensity: 100,
  moshLengthSeconds: 0,
  sceneThreshold: 0.3,
  // Shorter GOP gives tighter, choppier mosh bursts by default.
  gopSize: 30,
  seed: 0
};

// Mode browser config metadata for datamosh defaults.
export const datamoshConfigFields: ModeConfigField<DatamoshConfig>[] = [
  {
    key: "intensity",
    label: "Intensity",
    kind: "range",
    min: 0,
    max: 100,
    unit: "%",
    description: "Controls how aggressive the smear gets inside each mosh window."
  },
  {
    key: "moshLengthSeconds",
    label: "Mosh length",
    kind: "range",
    min: 0,
    max: 10,
    step: 0.1,
    unit: "s",
    formatValue: (value) => (value <= 0 ? "Infinite (to end)" : `${value.toFixed(1)}s`),
    description: "How long each mosh window lasts. Set to 0 to run to the end."
  },
  {
    key: "sceneThreshold",
    label: "Scene threshold",
    kind: "range",
    min: 0.05,
    max: 0.6,
    step: 0.05,
    description: "Lower values detect more cuts; higher values only catch big changes."
  },
  {
    key: "gopSize",
    label: "GOP size",
    kind: "number",
    min: 30,
    max: 600,
    step: 1,
    formatValue: (value) => `${value} frames`,
    description: "Keyframe interval used during prep. Smaller GOPs feel choppier."
  },
  {
    key: "seed",
    label: "Seed",
    kind: "number",
    min: 0,
    max: 9999,
    step: 1,
    description: "Keeps the random smear placement repeatable."
  }
];
