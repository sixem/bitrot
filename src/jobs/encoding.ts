// Encoder capability detection (NVENC).
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

export const probeNvencSupport = async () => detectNvencSupport();

export const getNvencSupportStatus = () => {
  if (nvencSupport === null) {
    return "unknown";
  }
  return nvencSupport ? "supported" : "unsupported";
};

export const isNvencAvailable = () => nvencSupport === true;
