// Handles preview keyboard shortcuts for trim and frame stepping.
import { useEffect, type MutableRefObject } from "react";
import type { TrimControl } from "@/editor/preview/types";
import { isEditableTarget } from "@/editor/preview/utils";

type UsePreviewKeyboardArgs = {
  controlsDisabled: boolean;
  sourceUrl: string;
  hasFrameMap: boolean;
  frameDurationSeconds?: number;
  canRequestFrameMap: boolean;
  trim?: TrimControl;
  nudgeTrimBoundary: (boundary: "start" | "end", deltaFrames: number) => void;
  seekByFrames: (deltaFrames: number) => void;
  startHoldPlayback: (direction: "forward" | "reverse") => void;
  stopHoldPlayback: () => void;
  holdActiveRef: MutableRefObject<boolean>;
  holdKeyRef: MutableRefObject<"ArrowLeft" | "ArrowRight" | null>;
  onRequestFrameMap: () => void;
  onTogglePlayback: () => void;
};

// Keyboard shortcuts for frame-by-frame nudging and trim adjustments.
const usePreviewKeyboard = ({
  controlsDisabled,
  sourceUrl,
  hasFrameMap,
  frameDurationSeconds,
  canRequestFrameMap,
  trim,
  nudgeTrimBoundary,
  seekByFrames,
  startHoldPlayback,
  stopHoldPlayback,
  holdActiveRef,
  holdKeyRef,
  onRequestFrameMap,
  onTogglePlayback
}: UsePreviewKeyboardArgs) => {
  useEffect(() => {
    const canNudgeFrames = hasFrameMap || !!frameDurationSeconds;
    const canPromptFrameMap = canRequestFrameMap;
    const isModalOpen = () => document?.body?.dataset.modalOpen === "true";

    const resolveFrameDelta = (key: string) => {
      // Support comma/period frame stepping alongside arrow keys.
      switch (key) {
        case "ArrowRight":
        case ".":
          return 1;
        case "ArrowLeft":
        case ",":
          return -1;
        default:
          return 0;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isModalOpen()) {
        if (holdActiveRef.current) {
          holdKeyRef.current = null;
          stopHoldPlayback();
        }
        return;
      }
      if (controlsDisabled || !sourceUrl) {
        return;
      }
      // Space toggles play/pause across the editor preview.
      const isSpace =
        event.code === "Space" || event.key === " " || event.key === "Spacebar";
      if (isSpace) {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        onTogglePlayback();
        return;
      }
      const delta = resolveFrameDelta(event.key);
      if (delta === 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      const isArrowKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (isArrowKey && event.shiftKey && trim) {
        event.preventDefault();
        if (!canNudgeFrames && canPromptFrameMap) {
          onRequestFrameMap();
          return;
        }
        nudgeTrimBoundary("start", delta);
        return;
      }
      if (isArrowKey && event.altKey && trim) {
        event.preventDefault();
        if (!canNudgeFrames && canPromptFrameMap) {
          onRequestFrameMap();
          return;
        }
        nudgeTrimBoundary("end", delta);
        return;
      }

      event.preventDefault();
      if (isArrowKey && event.repeat) {
        // Use OS repeat delay as the "hold" threshold for continuous playback.
        if (!holdActiveRef.current) {
          if (delta > 0 || canNudgeFrames) {
            startHoldPlayback(delta > 0 ? "forward" : "reverse");
          } else if (canPromptFrameMap) {
            onRequestFrameMap();
          }
        }
        return;
      }
      if (!canNudgeFrames) {
        if (canPromptFrameMap) {
          onRequestFrameMap();
        }
        return;
      }
      if (isArrowKey && !holdKeyRef.current) {
        holdKeyRef.current = event.key;
      }
      seekByFrames(delta);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isModalOpen()) {
        if (holdActiveRef.current) {
          holdKeyRef.current = null;
          stopHoldPlayback();
        }
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (holdKeyRef.current && holdKeyRef.current !== event.key) {
        return;
      }
      event.preventDefault();

      holdKeyRef.current = null;
      if (holdActiveRef.current) {
        stopHoldPlayback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    canRequestFrameMap,
    controlsDisabled,
    frameDurationSeconds,
    hasFrameMap,
    holdActiveRef,
    holdKeyRef,
    nudgeTrimBoundary,
    onRequestFrameMap,
    onTogglePlayback,
    seekByFrames,
    sourceUrl,
    startHoldPlayback,
    stopHoldPlayback,
    trim
  ]);
};

export default usePreviewKeyboard;
