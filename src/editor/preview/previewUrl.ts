// Helpers for building cache-busted preview URLs.
import { convertFileSrc } from "@tauri-apps/api/core";

export const buildPreviewUrl = (path: string) =>
  `${convertFileSrc(path)}?v=${Date.now()}`;
