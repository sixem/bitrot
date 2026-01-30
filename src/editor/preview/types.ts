import type { TrimSelectionState } from "@/editor/useTrimSelection";

// Shared preview UI types so split components stay consistent.
export type TrimControl = {
  selection: TrimSelectionState;
  markIn: (timeSeconds: number) => void;
  markOut: (timeSeconds: number) => void;
  clear: () => void;
  toggleEnabled: () => void;
};

export type PreviewFramePayload = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type FramePreviewRequest = {
  timeSeconds: number;
  frame: Promise<PreviewFramePayload>;
};
