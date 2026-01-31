import type { VaporwaveConfig } from "@/modes/vaporwave";
import type { PreviewFramePayload } from "@/editor/preview/types";
import { uploadPreviewFrame } from "@/editor/preview/previewUpload";

type VaporwavePreviewUploadOptions = {
  shouldAbort?: () => boolean;
};

const VAPORWAVE_COMMANDS = {
  start: "vaporwave_preview_start",
  append: "vaporwave_preview_append",
  finish: "vaporwave_preview_finish",
  discard: "vaporwave_preview_discard"
};

// Streams a preview frame to the vaporwave pipeline via chunked IPC.
export const sendVaporwavePreviewFrame = async (
  payload: PreviewFramePayload,
  config: VaporwaveConfig,
  options: VaporwavePreviewUploadOptions = {}
): Promise<string> => uploadPreviewFrame(payload, config, VAPORWAVE_COMMANDS, options);
