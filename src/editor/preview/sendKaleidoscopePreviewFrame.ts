import type { KaleidoscopeConfig } from "@/modes/kaleidoscope";
import type { PreviewFramePayload } from "@/editor/preview/types";
import { uploadPreviewFrame } from "@/editor/preview/previewUpload";

type KaleidoscopePreviewUploadOptions = {
  shouldAbort?: () => boolean;
};

const KALEIDOSCOPE_COMMANDS = {
  start: "kaleidoscope_preview_start",
  append: "kaleidoscope_preview_append",
  finish: "kaleidoscope_preview_finish",
  discard: "kaleidoscope_preview_discard"
};

export const sendKaleidoscopePreviewFrame = async (
  payload: PreviewFramePayload,
  config: KaleidoscopeConfig,
  options: KaleidoscopePreviewUploadOptions = {}
): Promise<string> => {
  return uploadPreviewFrame(payload, config, KALEIDOSCOPE_COMMANDS, options);
};
