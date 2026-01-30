import { invoke, isTauri } from "@tauri-apps/api/core";
import type { PixelsortConfig } from "@/modes/pixelsort";
import type { PreviewFramePayload } from "@/editor/preview/types";
import makeDebug from "@/utils/debug";

// Streams a preview frame to Rust in chunks to avoid oversized IPC payloads.

type PixelsortPreviewResponse = {
  path: string;
};

type PixelsortPreviewUploadOptions = {
  shouldAbort?: () => boolean;
};

// Keep chunks small to stay under IPC message size caps.
const PREVIEW_CHUNK_BYTES = 128 * 1024;
const debug = makeDebug("preview:upload");

const buildPreviewId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const abortIfRequested = (shouldAbort?: () => boolean) => {
  if (shouldAbort?.()) {
    throw new Error("Preview request canceled.");
  }
};

export const sendPixelsortPreviewFrame = async (
  payload: PreviewFramePayload,
  config: PixelsortConfig,
  options: PixelsortPreviewUploadOptions = {}
): Promise<string> => {
  if (!isTauri()) {
    debug("preview upload aborted: Tauri backend not available.");
    throw new Error("Preview requires the Tauri backend. Run `pnpm tauri dev`.");
  }

  const previewId = buildPreviewId();
  const { width, height, data } = payload;
  const { shouldAbort } = options;
  const expected = width * height * 4;

  if (!Number.isFinite(expected) || data.length !== expected) {
    throw new Error("Preview buffer size mismatch.");
  }

  try {
    abortIfRequested(shouldAbort);
    await invoke("pixelsort_preview_start", { previewId, width, height });

    for (let offset = 0; offset < data.length; offset += PREVIEW_CHUNK_BYTES) {
      abortIfRequested(shouldAbort);
      const chunk = data.subarray(offset, offset + PREVIEW_CHUNK_BYTES);
      // Send the typed array directly; Tauri serializes Uint8Array payloads.
      await invoke("pixelsort_preview_append", { previewId, chunk });
    }

    abortIfRequested(shouldAbort);
    const response = await invoke<PixelsortPreviewResponse>(
      "pixelsort_preview_finish",
      { previewId, config }
    );
    return response.path;
  } catch (error) {
    debug("upload failed id=%s error=%O", previewId, error);
    await invoke("pixelsort_preview_discard", { previewId }).catch(() => {});
    throw error;
  }
};
