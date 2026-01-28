// Encoding presets for export. These are intentionally conservative and web-safe.
export type EncodingId =
  | "h264_fast"
  | "h264_balanced"
  | "h264_quality"
  | "h264_nvenc";

export type EncoderKind = "libx264" | "h264_nvenc";

export type EncodingPreset = {
  id: EncodingId;
  label: string;
  description: string;
  notes: string;
  encoder: EncoderKind;
  preset: string;
  crf?: number;
  cq?: number;
};

const BASE_ENCODING_PRESETS: EncodingPreset[] = [
  {
    id: "h264_fast",
    label: "Fast MP4 (H.264)",
    description: "Fastest export with larger files and softer detail.",
    notes: "Web compatible. Best for quick iteration and sharing.",
    encoder: "libx264",
    preset: "ultrafast",
    crf: 24
  },
  {
    id: "h264_balanced",
    label: "Balanced MP4 (H.264)",
    description: "Good tradeoff between speed, size, and clarity.",
    notes: "Web compatible. A solid default for most clips.",
    encoder: "libx264",
    preset: "veryfast",
    crf: 20
  },
  {
    id: "h264_quality",
    label: "Quality MP4 (H.264)",
    description: "Higher quality with slower encoding and smaller files.",
    notes: "Web compatible. Use when you care about final output.",
    encoder: "libx264",
    preset: "medium",
    crf: 18
  }
];

const NVENC_PRESET: EncodingPreset = {
  id: "h264_nvenc",
  label: "NVIDIA NVENC (H.264)",
  description: "Hardware-accelerated export using NVENC when available.",
  notes: "Requires NVIDIA GPU + NVENC-enabled FFmpeg. Web compatible.",
  encoder: "h264_nvenc",
  preset: "p4",
  cq: 19
};

export const DEFAULT_ENCODING_ID: EncodingId = "h264_fast";

let nvencSupport: boolean | null = null;
let nvencProbePromise: Promise<boolean> | null = null;

const detectNvencSupport = async (): Promise<boolean> => {
  if (nvencSupport !== null) {
    return nvencSupport;
  }
  if (!nvencProbePromise) {
    nvencProbePromise = (async () => {
      try {
        const { executeWithFallback } = await import("@/system/shellCommand");
        const { output } = await executeWithFallback("ffmpeg", [
          "-hide_banner",
          "-encoders"
        ]);
        const raw = [output.stdout, output.stderr].filter(Boolean).join("\n");
        const supported = output.code === 0 && /\bh264_nvenc\b/i.test(raw);
        nvencSupport = supported;
        return supported;
      } catch {
        nvencSupport = false;
        return false;
      }
    })();
  }
  return nvencProbePromise;
};

export const getAvailableEncodingPresets = async (): Promise<EncodingPreset[]> => {
  const nvencAvailable = await detectNvencSupport();
  return nvencAvailable
    ? [...BASE_ENCODING_PRESETS, NVENC_PRESET]
    : [...BASE_ENCODING_PRESETS];
};

const getAllPresets = () => [...BASE_ENCODING_PRESETS, NVENC_PRESET];

export const getEncodingPreset = (id?: EncodingId) => {
  const fallback =
    BASE_ENCODING_PRESETS.find((preset) => preset.id === DEFAULT_ENCODING_ID) ??
    BASE_ENCODING_PRESETS[0];
  const selected = getAllPresets().find((preset) => preset.id === id) ?? fallback;
  if (selected.id === "h264_nvenc" && nvencSupport !== true) {
    return fallback;
  }
  return selected;
};

export const buildVideoEncodingArgs = (preset: EncodingPreset) => {
  if (preset.encoder === "h264_nvenc") {
    const cq = preset.cq ?? 19;
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      preset.preset,
      "-rc",
      "vbr",
      "-cq",
      `${cq}`,
      "-b:v",
      "0"
    ];
  }

  const crf = preset.crf ?? 20;
  return ["-c:v", "libx264", "-preset", preset.preset, "-crf", `${crf}`];
};

export const isNvencAvailable = () => nvencSupport === true;

// Backwards-compatible export for static lists; UI should prefer getAvailableEncodingPresets.
export const ENCODING_PRESETS = BASE_ENCODING_PRESETS;
