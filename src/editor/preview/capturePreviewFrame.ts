import type { PreviewFramePayload } from "@/editor/preview/types";
import makeDebug from "@/utils/debug";

// Helpers for capturing a video frame into a preview-sized RGBA buffer.

const MAX_PREVIEW_DIMENSION = 1280;
const debug = makeDebug("preview:capture");

const resolvePreviewSize = (width: number, height: number) => {
  const maxDim = Math.max(width, height);
  if (maxDim <= MAX_PREVIEW_DIMENSION) {
    return { width, height };
  }
  const scale = MAX_PREVIEW_DIMENSION / maxDim;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};

const downscaleRgbaNearest = (
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
) => {
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    return src;
  }
  const dst = new Uint8Array(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = Math.floor((y * srcHeight) / dstHeight);
    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = Math.floor((x * srcWidth) / dstWidth);
      const srcIndex = (srcY * srcWidth + srcX) * 4;
      const dstIndex = (y * dstWidth + x) * 4;
      dst[dstIndex] = src[srcIndex];
      dst[dstIndex + 1] = src[srcIndex + 1];
      dst[dstIndex + 2] = src[srcIndex + 2];
      dst[dstIndex + 3] = src[srcIndex + 3];
    }
  }
  return dst;
};

const swizzleBgraToRgba = (data: Uint8Array) => {
  for (let i = 0; i < data.length; i += 4) {
    const b = data[i];
    data[i] = data[i + 2];
    data[i + 2] = b;
  }
};

const waitForVideoFrame = (video: HTMLVideoElement, timeoutMs = 1000) =>
  new Promise<void>((resolve) => {
    let settled = false;
    const cleanups: Array<() => void> = [];
    const finish = (label: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      if (label.includes("timeout")) {
        debug("frame wait timed out (%s)", label);
      }
      resolve();
    };
    const timeout = window.setTimeout(
      () => finish(`timeout:${timeoutMs}ms`),
      timeoutMs
    );
    cleanups.push(() => window.clearTimeout(timeout));

    const resolveOnPaint = (source: string) => {
      // WebView2's requestVideoFrameCallback can be flaky; use rAF for reliability.
      requestAnimationFrame(() => finish(`${source}:raf`));
    };

    if (video.seeking) {
      const onSeeked = () => resolveOnPaint("seeked");
      video.addEventListener("seeked", onSeeked, { once: true });
      cleanups.push(() => video.removeEventListener("seeked", onSeeked));
      return;
    }
    if (video.readyState >= 2) {
      resolveOnPaint("ready");
      return;
    }
    const onLoaded = () => resolveOnPaint("loadeddata");
    video.addEventListener("loadeddata", onLoaded, { once: true });
    cleanups.push(() => video.removeEventListener("loadeddata", onLoaded));
  });

const captureViaVideoFrame = async (
  video: HTMLVideoElement
): Promise<PreviewFramePayload> => {
  if (typeof (window as typeof window & { VideoFrame?: typeof VideoFrame }).VideoFrame !== "function") {
    throw new Error("VideoFrame is not available.");
  }

  const frame = new VideoFrame(video);
  try {
    const sourceWidth = frame.displayWidth || frame.codedWidth;
    const sourceHeight = frame.displayHeight || frame.codedHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("VideoFrame dimensions unavailable.");
    }

    const { width, height } = resolvePreviewSize(sourceWidth, sourceHeight);
    const preferredFormats: Array<"RGBA" | "BGRA"> = ["RGBA", "BGRA"];

    let data: Uint8Array | null = null;
    let formatUsed: "RGBA" | "BGRA" | null = null;

    for (const format of preferredFormats) {
      const buffer = new Uint8Array(sourceWidth * sourceHeight * 4);
      try {
        await frame.copyTo(buffer, {
          format,
          layout: [{ offset: 0, stride: sourceWidth * 4 }]
        });
        data = buffer;
        formatUsed = format;
        break;
      } catch {
        // Try the next format.
      }
    }

    if (!data || !formatUsed) {
      throw new Error("VideoFrame copyTo failed.");
    }

    if (formatUsed === "BGRA") {
      swizzleBgraToRgba(data);
    }

    const scaled = downscaleRgbaNearest(data, sourceWidth, sourceHeight, width, height);
    return { width, height, data: scaled };
  } finally {
    frame.close();
  }
};

// Captures the current video frame into a clamped RGBA buffer for native previews.
export const capturePreviewFrame = async (
  video: HTMLVideoElement
): Promise<PreviewFramePayload> => {
  await waitForVideoFrame(video);

  try {
    const payload = await captureViaVideoFrame(video);
    debug(
      "capture done (VideoFrame): %dx%d bytes=%d",
      payload.width,
      payload.height,
      payload.data.length
    );
    return payload;
  } catch (error) {
    debug("capture via VideoFrame failed, falling back to canvas: %O", error);
  }

  const sourceWidth = Math.round(video.videoWidth);
  const sourceHeight = Math.round(video.videoHeight);
  if (!sourceWidth || !sourceHeight) {
    debug(
      "capture failed: readyState=%d seeking=%s time=%.3f size=%dx%d",
      video.readyState,
      video.seeking,
      video.currentTime,
      sourceWidth,
      sourceHeight
    );
    throw new Error("Preview video is not ready.");
  }

  const { width, height } = resolvePreviewSize(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Preview canvas unavailable.");
  }
  // Let the UI flush logs before we do a potentially heavy draw/readback.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    ctx.drawImage(video, 0, 0, width, height);
  } catch (error) {
    debug("capture draw failed: %O", error);
    throw error;
  }
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (error) {
    debug("capture readback failed: %O", error);
    throw error;
  }
  const data = new Uint8Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength
  );

  const payload = { width, height, data };
  debug("capture done (canvas): %dx%d bytes=%d", width, height, data.length);
  return payload;
};
