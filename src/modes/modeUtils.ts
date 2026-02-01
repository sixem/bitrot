import type { ModeCatalogEntry, ModeConfigMap, ModeId } from "@/modes/definitions";

// Shared helpers for mode catalog filtering and config diffing.

// Flatten mode metadata into a lowercase search string for fuzzy-ish matching.
export const buildModeSearchText = (mode: ModeCatalogEntry) =>
  [
    mode.label,
    mode.description,
    mode.details,
    mode.engine,
    ...(mode.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// Configs are flat today, so a shallow comparison keeps things fast and clear.
export const isModeConfigEqual = (
  current: ModeConfigMap[ModeId],
  defaults: ModeConfigMap[ModeId]
) => {
  const keys = new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(defaults ?? {})
  ]);
  for (const key of keys) {
    if (current?.[key as keyof typeof current] !== defaults?.[key as keyof typeof defaults]) {
      return false;
    }
  }
  return true;
};
