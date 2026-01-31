import { buildAnalogFilter } from "@/modes/glitchLite";
import {
  buildGlitchFilter,
  defaultGlitchConfig,
  type GlitchConfig
} from "@/modes/glitch";
import {
  buildDatablendFilter,
  defaultDatablendConfig,
  type DatablendConfig
} from "@/modes/datablend";
import {
  defaultPixelsortConfig,
  type PixelsortConfig
} from "@/modes/pixelsort";
import {
  defaultModuloMappingConfig,
  type ModuloMappingConfig
} from "@/modes/moduloMapping";
import {
  defaultBlockShiftConfig,
  type BlockShiftConfig
} from "@/modes/blockShift";
import {
  defaultVaporwaveConfig,
  type VaporwaveConfig
} from "@/modes/vaporwave";
import {
  buildVhsFilter,
  defaultVhsConfig,
  type VhsConfig
} from "@/modes/vhs";
import { defaultDatamoshConfig, type DatamoshConfig } from "@/modes/datamosh";

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
  | "datamosh";

export type ModeEngine = "ffmpeg" | "native";
export type ModeRunner =
  | "ffmpeg"
  | "pixelsort"
  | "datamosh"
  | "modulo-mapping"
  | "block-shift"
  | "vaporwave";
export type ModePreview =
  | "pixelsort"
  | "modulo-mapping"
  | "block-shift"
  | "vaporwave";
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
  encode: "copy" | "h264";
};

// Central list of available processing modes.
export const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    id: "copy",
    label: "Passthrough",
    description: "No effects. Stream copy when possible for fastest exports.",
    details: "Zero processing. Fastest option when passthrough is allowed.",
    tags: ["fast", "clean", "passthrough"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    defaultConfig: {},
    encode: "copy"
  },
  {
    id: "analog",
    label: "Analog",
    description: "Soft analog grit with mild noise + clarity.",
    details: "A gentle starting point for lo-fi texture and understated grit.",
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
    details: "Adds tracking wobble, chroma bleed, and tape-like softness.",
    tags: ["tape", "tracking", "chroma"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    buildFilter: (config) => buildVhsFilter(config as VhsConfig),
    defaultConfig: defaultVhsConfig,
    encode: "h264"
  },
  {
    id: "glitch",
    label: "Chroma glitch",
    description: "Digital tearing with chroma offsets and decay trails.",
    details: "Heavier digital artifacts with shifting chroma and noisy decay.",
    tags: ["digital", "tearing", "chroma"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    isExperimental: true,
    buildFilter: (config) => buildGlitchFilter(config as GlitchConfig),
    defaultConfig: defaultGlitchConfig,
    encode: "h264"
  },
  {
    id: "datablend",
    label: "Datablend",
    description: "Glitchy temporal blends with chroma bleed and noise.",
    details: "Temporal blending that stacks motion trails into a messy smear.",
    tags: ["temporal", "blend", "trail"],
    engine: "ffmpeg",
    runner: "ffmpeg",
    isExperimental: true,
    buildFilter: (config) => buildDatablendFilter(config as DatablendConfig),
    defaultConfig: defaultDatablendConfig,
    encode: "h264"
  },
  {
    id: "pixelsort",
    label: "Pixel sort",
    description: "Per-pixel sorting for streaky glitch smears and drips.",
    details: "Sorts pixel values into streaks and drips for high-energy chaos.",
    tags: ["streaks", "sort", "smear"],
    engine: "native",
    runner: "pixelsort",
    preview: "pixelsort",
    isExperimental: true,
    defaultConfig: defaultPixelsortConfig,
    encode: "h264"
  },
  {
    id: "modulo-mapping",
    label: "Modulo mapping",
    description: "Re-index pixels with modular arithmetic for patterned corruption.",
    details: "Re-maps pixels into geometric patterns and rhythmic corruption.",
    tags: ["pattern", "geometry", "corruption"],
    engine: "native",
    runner: "modulo-mapping",
    preview: "modulo-mapping",
    isExperimental: true,
    defaultConfig: defaultModuloMappingConfig,
    encode: "h264"
  },
  {
    id: "block-shift",
    label: "Block shift",
    description: "Slide macroblocks for bureaucratic grid-like rearrangements.",
    details: "Slides macroblocks to create grid-like displacement and jitter.",
    tags: ["blocks", "grid", "shift"],
    engine: "native",
    runner: "block-shift",
    preview: "block-shift",
    isExperimental: true,
    defaultConfig: defaultBlockShiftConfig,
    encode: "h264"
  },
  {
    id: "vaporwave",
    label: "Vaporwave",
    description: "Remap midtones into neon vaporwave palettes.",
    details: "Maps grayscale bands into cyan, magenta, purple, and teal.",
    tags: ["neon", "palette", "posterize"],
    engine: "native",
    runner: "vaporwave",
    preview: "vaporwave",
    isExperimental: true,
    defaultConfig: defaultVaporwaveConfig,
    encode: "h264"
  },
  {
    id: "datamosh",
    label: "Datamosh (classic)",
    description: "Scene-aware I-frame removal for classic smear effects.",
    details: "Drops I-frames for classic datamosh smears and motion melt.",
    tags: ["mosh", "i-frame", "classic"],
    engine: "native",
    runner: "datamosh",
    isExperimental: true,
    defaultConfig: defaultDatamoshConfig,
    encode: "h264"
  }
];

// UI-friendly metadata derived from the registry so lists stay consistent.
export type ModeCatalogEntry = Pick<
  ModeDefinition,
  "id" | "label" | "description" | "details" | "engine" | "isExperimental" | "tags"
>;

export const MODE_CATALOG: ModeCatalogEntry[] = MODE_DEFINITIONS.map((mode) => ({
  id: mode.id,
  label: mode.label,
  description: mode.description,
  details: mode.details,
  engine: mode.engine,
  isExperimental: mode.isExperimental,
  tags: mode.tags ?? []
}));

export const getModeDefinition = (id?: ModeId) =>
  MODE_DEFINITIONS.find((mode) => mode.id === id) ?? MODE_DEFINITIONS[0];

// Config objects are flat today, so a shallow clone keeps defaults isolated.
const cloneModeConfig = (config: ModeConfigMap[ModeId]) =>
  ({ ...config } as ModeConfigMap[ModeId]);

// Build fresh mode configs so UI edits never mutate shared defaults.
export const createModeConfigs = (): ModeConfigMap => {
  const configs = {} as ModeConfigMap;
  for (const mode of MODE_DEFINITIONS) {
    configs[mode.id] = cloneModeConfig(mode.defaultConfig);
  }
  return configs;
};
