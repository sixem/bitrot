// Export presets used to seed the advanced export options UI.
import {
  type ExportProfile,
  type ExportFormat,
  type VideoSpeed
} from "@/jobs/exportProfile";

export type ExportPresetId =
  | "mp4_fast"
  | "mp4_balanced"
  | "mp4_quality"
  | "mp4_small"
  | "webm_fast"
  | "webm_balanced"
  | "webm_quality"
  | "webm_small"
  | "mkv_fast"
  | "mkv_balanced"
  | "mkv_quality"
  | "mkv_small"
  | "mov_fast"
  | "mov_balanced"
  | "mov_quality"
  | "mov_small";

export type ExportPreset = {
  id: ExportPresetId;
  label: string;
  description: string;
  format: ExportFormat;
  profile: Partial<ExportProfile>;
};

const buildH264Preset = (
  id: ExportPresetId,
  format: ExportFormat,
  label: string,
  speed: VideoSpeed,
  quality: number,
  description: string
): ExportPreset => ({
  id,
  label,
  description,
  format,
  profile: {
    format,
    videoEncoder: "libx264",
    videoSpeed: speed,
    quality,
    videoMode: "encode"
  }
});

const buildVp9Preset = (
  id: ExportPresetId,
  format: ExportFormat,
  label: string,
  speed: VideoSpeed,
  quality: number,
  description: string
): ExportPreset => ({
  id,
  label,
  description,
  format,
  profile: {
    format,
    videoEncoder: "libvpx-vp9",
    videoSpeed: speed,
    quality,
    videoMode: "encode"
  }
});

export const EXPORT_PRESETS: ExportPreset[] = [
  buildH264Preset(
    "mp4_fast",
    "mp4",
    "Fast MP4 (H.264)",
    "fast",
    24,
    "Fastest export with larger files and softer detail."
  ),
  buildH264Preset(
    "mp4_balanced",
    "mp4",
    "Balanced MP4 (H.264)",
    "balanced",
    20,
    "Good tradeoff between speed, size, and clarity."
  ),
  buildH264Preset(
    "mp4_quality",
    "mp4",
    "Quality MP4 (H.264)",
    "quality",
    18,
    "Higher quality with slower encoding."
  ),
  buildH264Preset(
    "mp4_small",
    "mp4",
    "Small MP4 (H.264)",
    "quality",
    28,
    "Smallest MP4 files with softer detail."
  ),
  buildVp9Preset(
    "webm_fast",
    "webm",
    "Fast WebM (VP9)",
    "fast",
    34,
    "Fast VP9 export with larger files."
  ),
  buildVp9Preset(
    "webm_balanced",
    "webm",
    "Balanced WebM (VP9)",
    "balanced",
    32,
    "Web-friendly VP9 export for most clips."
  ),
  buildVp9Preset(
    "webm_quality",
    "webm",
    "Quality WebM (VP9)",
    "quality",
    28,
    "Higher quality VP9 with slower encoding."
  ),
  buildVp9Preset(
    "webm_small",
    "webm",
    "Small WebM (VP9)",
    "quality",
    36,
    "Smallest WebM files for size limits."
  ),
  buildH264Preset(
    "mkv_fast",
    "mkv",
    "Fast MKV (H.264)",
    "fast",
    24,
    "Fast MKV export with wider container support."
  ),
  buildH264Preset(
    "mkv_balanced",
    "mkv",
    "Balanced MKV (H.264)",
    "balanced",
    20,
    "Balanced MKV for compatibility workflows."
  ),
  buildH264Preset(
    "mkv_quality",
    "mkv",
    "Quality MKV (H.264)",
    "quality",
    18,
    "Quality MKV with slower encoding."
  ),
  buildH264Preset(
    "mkv_small",
    "mkv",
    "Small MKV (H.264)",
    "quality",
    28,
    "Smallest MKV files with softer detail."
  ),
  buildH264Preset(
    "mov_fast",
    "mov",
    "Fast MOV (H.264)",
    "fast",
    24,
    "Fast MOV export for editor workflows."
  ),
  buildH264Preset(
    "mov_balanced",
    "mov",
    "Balanced MOV (H.264)",
    "balanced",
    20,
    "Balanced MOV for post workflows."
  ),
  buildH264Preset(
    "mov_quality",
    "mov",
    "Quality MOV (H.264)",
    "quality",
    18,
    "Quality MOV with slower encoding."
  ),
  buildH264Preset(
    "mov_small",
    "mov",
    "Small MOV (H.264)",
    "quality",
    28,
    "Smallest MOV files with softer detail."
  )
];

export const DEFAULT_EXPORT_PRESET_ID: ExportPresetId = "mp4_balanced";

export const getExportPreset = (id?: ExportPresetId) =>
  EXPORT_PRESETS.find((preset) => preset.id === id) ?? EXPORT_PRESETS[0];
