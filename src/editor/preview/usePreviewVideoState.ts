import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

// Centralizes video element state + handlers for the preview UI.
type UsePreviewVideoStateOptions = {
  sourceUrl: string;
  holdActiveRef: MutableRefObject<boolean>;
  initialVolume?: number;
};

type UsePreviewVideoStateResult = {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  currentTime: number;
  setCurrentTime: (value: number) => void;
  duration?: number;
  isReady: boolean;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  error: string | null;
  volume: number;
  setVolume: (value: number) => void;
  resetState: () => void;
  handleTogglePlayback: () => void;
  handleLoadedMetadata: () => void;
  handleTimeUpdate: () => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleError: () => void;
};

const usePreviewVideoState = ({
  sourceUrl,
  holdActiveRef,
  initialVolume = 0.2
}: UsePreviewVideoStateOptions): UsePreviewVideoStateResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(initialVolume);

  const resetState = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setCurrentTime(0);
    setDuration(undefined);
    setIsReady(false);
    setIsPlaying(false);
    setError(null);
  }, []);

  // Keep the element in sync with the current volume value.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.volume = volume;
    video.muted = volume === 0;
  }, [volume, sourceUrl]);

  const handleTogglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !sourceUrl || error) {
      return;
    }
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setError("Playback blocked. Click play again.");
      }
      return;
    }
    video.pause();
  }, [error, sourceUrl]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
    }
    setIsReady(true);
    setError(null);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setCurrentTime(video.currentTime);
  }, []);

  const handlePlay = useCallback(() => {
    if (holdActiveRef.current) {
      return;
    }
    setIsPlaying(true);
  }, [holdActiveRef]);

  const handlePause = useCallback(() => {
    if (holdActiveRef.current) {
      return;
    }
    setIsPlaying(false);
  }, [holdActiveRef]);

  const handleError = useCallback(() => {
    setError("Unable to load preview.");
    setIsReady(false);
  }, []);

  return {
    videoRef,
    currentTime,
    setCurrentTime,
    duration,
    isReady,
    isPlaying,
    setIsPlaying,
    error,
    volume,
    setVolume,
    resetState,
    handleTogglePlayback,
    handleLoadedMetadata,
    handleTimeUpdate,
    handlePlay,
    handlePause,
    handleError
  };
};

export default usePreviewVideoState;
