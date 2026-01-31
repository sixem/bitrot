// Controls press-and-hold playback behavior for arrow-key navigation.
import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { HOLD_PLAYBACK_RATE } from "@/editor/preview/utils";

type UseArrowHoldPlaybackArgs = {
  videoRef: RefObject<HTMLVideoElement>;
  holdActiveRef: MutableRefObject<boolean>;
  holdKeyRef: MutableRefObject<"ArrowLeft" | "ArrowRight" | null>;
  controlsDisabled: boolean;
  sourceUrl: string;
  hasFrameMap: boolean;
  frameDurationSeconds?: number;
  reverseStepIntervalMs: number;
  canRequestFrameMap: boolean;
  onRequestFrameMap: () => void;
  seekByFrames: (deltaFrames: number) => void;
  setCurrentTime: (value: number) => void;
  setIsPlaying: (value: boolean) => void;
};

// Handles press-and-hold playback with arrow keys (forward or simulated reverse).
const useArrowHoldPlayback = ({
  videoRef,
  holdActiveRef,
  holdKeyRef,
  controlsDisabled,
  sourceUrl,
  hasFrameMap,
  frameDurationSeconds,
  reverseStepIntervalMs,
  canRequestFrameMap,
  onRequestFrameMap,
  seekByFrames,
  setCurrentTime,
  setIsPlaying
}: UseArrowHoldPlaybackArgs) => {
  const reverseIntervalRef = useRef<number | null>(null);
  const holdPlaybackRef = useRef<{ playbackRate: number } | null>(null);

  const stopHoldPlayback = useCallback(() => {
    if (!holdActiveRef.current && reverseIntervalRef.current === null) {
      return;
    }
    if (reverseIntervalRef.current !== null) {
      window.clearInterval(reverseIntervalRef.current);
      reverseIntervalRef.current = null;
    }
    const video = videoRef.current;
    const restore = holdPlaybackRef.current;
    if (video) {
      if (restore) {
        video.playbackRate = restore.playbackRate;
      }
      // Hold playback should always stop when the key is released.
      video.pause();
      setCurrentTime(video.currentTime);
      setIsPlaying(!video.paused);
    }
    holdPlaybackRef.current = null;
    holdActiveRef.current = false;
    holdKeyRef.current = null;
  }, [setCurrentTime, setIsPlaying, videoRef]);

  const startHoldPlayback = useCallback(
    (direction: "forward" | "reverse") => {
      const video = videoRef.current;
      if (!video || controlsDisabled || !sourceUrl) {
        return;
      }
      if (holdActiveRef.current) {
        return;
      }
      if (direction === "reverse" && !hasFrameMap && !frameDurationSeconds) {
        if (canRequestFrameMap) {
          onRequestFrameMap();
        }
        return;
      }
      holdActiveRef.current = true;
      holdPlaybackRef.current = { playbackRate: video.playbackRate };
      if (direction === "forward") {
        video.playbackRate = HOLD_PLAYBACK_RATE;
        void video.play();
        return;
      }
      if (!video.paused) {
        video.pause();
      }
      reverseIntervalRef.current = window.setInterval(() => {
        seekByFrames(-1);
      }, reverseStepIntervalMs);
    },
    [
      canRequestFrameMap,
      controlsDisabled,
      frameDurationSeconds,
      hasFrameMap,
      onRequestFrameMap,
      reverseStepIntervalMs,
      seekByFrames,
      sourceUrl,
      videoRef
    ]
  );

  useEffect(() => {
    const handleBlur = () => {
      if (holdActiveRef.current) {
        stopHoldPlayback();
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (holdActiveRef.current) {
          stopHoldPlayback();
        }
      }
    };
    const handlePointerDown = () => {
      if (holdActiveRef.current) {
        stopHoldPlayback();
      }
    };
    const handleFocusIn = () => {
      if (holdActiveRef.current) {
        stopHoldPlayback();
      }
    };
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("focusin", handleFocusIn, true);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [stopHoldPlayback]);

  // Ensure hold playback is stopped if the component unmounts mid-hold.
  useEffect(() => () => stopHoldPlayback(), [stopHoldPlayback]);

  return {
    startHoldPlayback,
    stopHoldPlayback
  };
};

export default useArrowHoldPlayback;
