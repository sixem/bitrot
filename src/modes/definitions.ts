import { buildAnalogFilter } from "@/modes/glitchLite";
import {
  buildGlitchFilter,
  glitchConfigFields,
  defaultGlitchConfig,
  type GlitchConfig
} from "@/modes/glitch";
import {
  buildDatablendFilter,
  datablendConfigFields,
  defaultDatablendConfig,
  type DatablendConfig
} from "@/modes/datablend";
import {
  pixelsortConfigFields,
  defaultPixelsortConfig,
  type PixelsortConfig
} from "@/modes/pixelsort";
import {
  moduloMappingConfigFields,
  defaultModuloMappingConfig,
  type ModuloMappingConfig
} from "@/modes/moduloMapping";
import {
  blockShiftConfigFields,
  defaultBlockShiftConfig,
  type BlockShiftConfig
} from "@/modes/blockShift";
import {
  vaporwaveConfigFields,
  defaultVaporwaveConfig,
  type VaporwaveConfig
} from "@/modes/vaporwave";
import {
  kaleidoscopeConfigFields,
  defaultKaleidoscopeConfig,
  type KaleidoscopeConfig
} from "@/modes/kaleidoscope";
import {
  buildVhsFilter,
  vhsConfigFields,
  defaultVhsConfig,
  type VhsConfig
} from "@/modes/vhs";
import {
  datamoshConfigFields,
  defaultDatamoshConfig,
  type DatamoshConfig
} from "@/modes/datamosh";
import type { ModeConfigField } from "@/modes/configFields";

// Keep ModeId and MODE_DEFINITIONS aligned; most lookups depend on this union.
export type ModeId =
  | "copy"
  | "analog"
  | "vhs"
  | "glitch"
  | "datablend"
  | "pixelsort"
  | "modulo-mapping"
  | "block-shift"
  | "vaporwave"
  | "kaleidoscope"
  | "datamosh";

export type ModeEngine = "ffmpeg" | "native";
export type ModeRunner =
  | "ffmpeg"
  | "pixelsort"
  | "datamosh"
  | "modulo-mapping"
  | "block-shift"
  | "vaporwave"
  | "kaleidoscope";
export type ModePreview =
  | "pixelsort"
  | "modulo-mapping"
  | "block-shift"
  | "vaporwave"
  | "kaleidoscope";
export type ModeTag = string;

export type ModeConfigMap = {
  copy: Record<string, never>;
  analog: Record<string, never>;
  vhs: VhsConfig;
  glitch: GlitchConfig;
  datablend: DatablendConfig;
  "modulo-mapping": ModuloMappingConfig;
  "block-shift": BlockShiftConfig;
  vaporwave: VaporwaveConfig;
  kaleidoscope: KaleidoscopeConfig;
  pixelsort: PixelsortConfig;
  datamosh: DatamoshConfig;
};

export type ModeDefinition<T extends ModeId = ModeId> = {
  id: T;
  label: string;
  description: string;
  details?: string;
  tags?: ModeTag[];
  engine: ModeEngine;
  runner: ModeRunner;
  preview?: ModePreview;
  isExperimental?: boolean;
  buildFilter?: (config: ModeConfigMap[T]) => string;
  defaultConfig: ModeConfigMap[T];
  configFields?: ModeConfigField<ModeConfigMap[T]>[];
  encode: "copy" | "h264";
};

// Central list of available processing modes.
export const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    id: "copy",
    label: "Passthrough",
    description: "No effects. Stream copy when possible for fastest exports.",
    details: "Keeps video untouched for maximum speed and identical output quality.",
    tags: ["fast", "clean", "passthrough"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    defaultConfig: {},
    encode: "copy"
  },
  {
    id: "datamosh",
    label: "Datamosh (classic)",
    description: "Scene-aware I-frame removal for classic datamosh smears.",
    details: "Cuts around scene changes, then drops keyframes to melt motion together.",
    tags: ["mosh", "i-frame", "classic"],
    engine: "native",
    runner: "datamosh",
    defaultConfig: defaultDatamoshConfig,
    configFields: datamoshConfigFields,
    encode: "h264"
  },
  {
    id: "pixelsort",
    label: "Pixel sort",
    description: "Per-pixel sorting for streaky glitch smears and drips.",
    details: "Reorders pixel bands into directional streaks with chaotic, smeary motion.",
    tags: ["streaks", "sort", "smear"],
    engine: "native",
    runner: "pixelsort",
    preview: "pixelsort",
    defaultConfig: defaultPixelsortConfig,
    configFields: pixelsortConfigFields,
    encode: "h264"
  },
  {
    id: "vaporwave",
    label: "Vaporwave",
    description: "Remap midtones into neon vaporwave palettes.",
    details: "Posterizes grayscale bands into cyan, magenta, purple, and teal tones.",
    tags: ["neon", "palette", "posterize"],
    engine: "native",
    runner: "vaporwave",
    preview: "vaporwave",
    defaultConfig: defaultVaporwaveConfig,
    configFields: vaporwaveConfigFields,
    encode: "h264"
  },
  {
    id: "kaleidoscope",
    label: "Kaleidoscope",
    description: "Mirror slices of the frame into symmetric wedges.",
    details: "Reflects pixels around a center point for prismatic symmetry.",
    tags: ["mirror", "symmetry", "prism"],
    engine: "native",
    runner: "kaleidoscope",
    preview: "kaleidoscope",
    defaultConfig: defaultKaleidoscopeConfig,
    configFields: kaleidoscopeConfigFields,
    encode: "h264"
  },
  {
    id: "analog",
    label: "Analog",
    description: "Soft analog grit with mild noise and clarity.",
    details: "A gentle starting point for lo-fi texture without heavy distortion.",
    tags: ["analog", "soft", "grain"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    buildFilter: () => buildAnalogFilter(),
    defaultConfig: {},
    encode: "h264"
  },
  {
    id: "vhs",
    label: "VHS",
    description: "Tape-style tracking noise, softness, and chroma bleed.",
    details: "Adds tracking wobble and chroma shifts for a worn tape look.",
    tags: ["tape", "tracking", "chroma"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    buildFilter: (config) => buildVhsFilter(config as VhsConfig),
    defaultConfig: defaultVhsConfig,
    configFields: vhsConfigFields,
    encode: "h264"
  },
  {
    id: "glitch",
    label: "Chroma glitch",
    description: "Digital tearing with chroma offsets and decay trails.",
    details: "Pushes color splits and noisy breakup for aggressive digital damage.",
    tags: ["digital", "tearing", "chroma"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    buildFilter: (config) => buildGlitchFilter(config as GlitchConfig),
    defaultConfig: defaultGlitchConfig,
    configFields: glitchConfigFields,
    encode: "h264"
  },
  {
    id: "datablend",
    label: "Datablend",
    description: "Glitchy temporal blends with chroma bleed and noise.",
    details: "Stacks neighboring frames into smeared trails and washed color bleed.",
    tags: ["temporal", "blend", "trail"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    isExperimental: true,
    buildFilter: (config) => buildDatablendFilter(config as DatablendConfig),
    defaultConfig: defaultDatablendConfig,
    configFields: datablendConfigFields,
    encode: "h264"
  },
  {
    id: "modulo-mapping",
    label: "Modulo mapping",
    description: "Re-index pixels with modular arithmetic for patterned corruption.",
    details: "Remaps the image into geometric repeats and rhythmic displacement.",
    tags: ["pattern", "geometry", "corruption"],
    engine: "native",
    runner: "modulo-mapping",
    preview: "modulo-mapping",
    isExperimental: true,
    defaultConfig: defaultModuloMappingConfig,
    configFields: moduloMappingConfigFields,
    encode: "h264"
  },
  {
    id: "block-shift",
    label: "Block shift",
    description: "Slide macroblocks for grid-like rearrangements.",
    details: "Shifts blocks across a rigid grid for jittery, tiled displacement.",
    tags: ["blocks", "grid", "shift"],
    engine: "native",
    runner: "block-shift",
    preview: "block-shift",
    isExperimental: true,
    defaultConfig: defaultBlockShiftConfig,
    configFields: blockShiftConfigFields,
    encode: "h264"
  }
];

// UI-friendly metadata derived from the registry so lists stay consistent.
export type ModeCatalogEntry = Pick<
  ModeDefinition,
  | "id"
  | "label"
  | "description"
  | "details"
  | "engine"
  | "isExperimental"
  | "tags"
  | "configFields"
>;

export const MODE_CATALOG: ModeCatalogEntry[] = MODE_DEFINITIONS.map((mode) => ({
  id: mode.id,
  label: mode.label,
  description: mode.description,
  details: mode.details,
  engine: mode.engine,
  isExperimental: mode.isExperimental,
  tags: mode.tags ?? [],
  configFields: mode.configFields
}));

export const getModeDefinition = (id?: ModeId) =>
  MODE_DEFINITIONS.find((mode) => mode.id === id) ?? MODE_DEFINITIONS[0];

// Config objects are flat today, so a shallow clone keeps defaults isolated.
const cloneModeConfig = (config: ModeConfigMap[ModeId]) =>
  ({ ...config } as ModeConfigMap[ModeId]);

// Clone a config map so edits never mutate shared state.
export const cloneModeConfigs = (configs: ModeConfigMap): ModeConfigMap => {
  const next = {} as ModeConfigMap;
  for (const mode of MODE_DEFINITIONS) {
    next[mode.id] = cloneModeConfig(configs[mode.id]);
  }
  return next;
};

// Build fresh mode configs so UI edits never mutate shared defaults.
export const createModeConfigs = (): ModeConfigMap => {
  const configs = {} as ModeConfigMap;
  for (const mode of MODE_DEFINITIONS) {
    configs[mode.id] = cloneModeConfig(mode.defaultConfig);
  }
  return configs;
};
