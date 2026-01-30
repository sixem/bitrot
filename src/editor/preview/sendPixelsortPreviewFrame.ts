import type { PixelsortConfig } from "@/modes/pixelsort";
import type { PreviewFramePayload } from "@/editor/preview/types";
import { uploadPreviewFrame } from "@/editor/preview/previewUpload";

type PixelsortPreviewUploadOptions = {
  shouldAbort?: () => boolean;
};

const PIXELSORT_COMMANDS = {
  start: "pixelsort_preview_start",
  append: "pixelsort_preview_append",
  finish: "pixelsort_preview_finish",
  discard: "pixelsort_preview_discard"
};

export const sendPixelsortPreviewFrame = async (
  payload: PreviewFramePayload,
  config: PixelsortConfig,
  options: PixelsortPreviewUploadOptions = {}
): Promise<string> => {
  return uploadPreviewFrame(payload, config, PIXELSORT_COMMANDS, options);
};
