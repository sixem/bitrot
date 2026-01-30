import type { ModuloMappingConfig } from "@/modes/moduloMapping";
import type { PreviewFramePayload } from "@/editor/preview/types";
import { uploadPreviewFrame } from "@/editor/preview/previewUpload";

type ModuloMappingPreviewUploadOptions = {
  shouldAbort?: () => boolean;
};

const MODULO_MAPPING_COMMANDS = {
  start: "modulo_mapping_preview_start",
  append: "modulo_mapping_preview_append",
  finish: "modulo_mapping_preview_finish",
  discard: "modulo_mapping_preview_discard"
};

// Streams a preview frame to the modulo mapping pipeline via chunked IPC.
// File name retained to avoid a wide rename across the repo.
export const sendModuloMappingPreviewFrame = async (
  payload: PreviewFramePayload,
  config: ModuloMappingConfig,
  options: ModuloMappingPreviewUploadOptions = {}
): Promise<string> => uploadPreviewFrame(payload, config, MODULO_MAPPING_COMMANDS, options);
