import type { BlockShiftConfig } from "@/modes/blockShift";
import type { PreviewFramePayload } from "@/editor/preview/types";
import { uploadPreviewFrame } from "@/editor/preview/previewUpload";

type BlockShiftPreviewUploadOptions = {
  shouldAbort?: () => boolean;
};

const BLOCK_SHIFT_COMMANDS = {
  start: "block_shift_preview_start",
  append: "block_shift_preview_append",
  finish: "block_shift_preview_finish",
  discard: "block_shift_preview_discard"
};

// Streams a preview frame to the block shift pipeline via chunked IPC.
export const sendBlockShiftPreviewFrame = async (
  payload: PreviewFramePayload,
  config: BlockShiftConfig,
  options: BlockShiftPreviewUploadOptions = {}
): Promise<string> => uploadPreviewFrame(payload, config, BLOCK_SHIFT_COMMANDS, options);
