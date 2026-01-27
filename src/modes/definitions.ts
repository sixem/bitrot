import { buildAnalogFilter } from "@/modes/glitchLite";
import {
  buildGlitchFilter,
  defaultGlitchConfig,
  type GlitchConfig
} from "@/modes/glitch";
import { defaultDatamoshConfig, type DatamoshConfig } from "@/modes/datamosh";

export type ModeId = "copy" | "analog" | "glitch" | "datamosh";

export type ModeConfigMap = {
  copy: Record<string, never>;
  analog: Record<string, never>;
  glitch: GlitchConfig;
  datamosh: DatamoshConfig;
};

export type ModeDefinition<T extends ModeId = ModeId> = {
  id: T;
  label: string;
  description: string;
  isExperimental?: boolean;
  buildFilter?: (config: ModeConfigMap[T]) => string;
  defaultConfig: ModeConfigMap[T];
  encode: "copy" | "h264";
};

// Central list of available processing modes.
export const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    id: "analog",
    label: "Analog",
    description: "Soft analog grit with mild noise + clarity.",
    buildFilter: () => buildAnalogFilter(),
    defaultConfig: {},
    encode: "h264"
  },
  {
    id: "glitch",
    label: "Chroma glitch",
    description: "Digital tearing with chroma offsets and decay trails.",
    isExperimental: true,
    buildFilter: (config) => buildGlitchFilter(config as GlitchConfig),
    defaultConfig: defaultGlitchConfig,
    encode: "h264"
  },
  {
    id: "datamosh",
    label: "Datamosh (classic)",
    description: "Scene-aware I-frame removal for classic smear effects.",
    isExperimental: true,
    defaultConfig: defaultDatamoshConfig,
    encode: "h264"
  },
  {
    id: "copy",
    label: "Copy (no effect)",
    description: "Pass-through export with no visual processing applied.",
    defaultConfig: {},
    encode: "copy"
  }
];

export const getModeDefinition = (id?: ModeId) =>
  MODE_DEFINITIONS.find((mode) => mode.id === id) ?? MODE_DEFINITIONS[0];

export const createModeConfigs = (): ModeConfigMap => ({
  copy: {},
  analog: {},
  glitch: { ...defaultGlitchConfig },
  datamosh: { ...defaultDatamoshConfig }
});
