// Playback skip/step helpers for the preview toolbar.
import { useCallback, useState, type MouseEvent } from "react";

type UsePreviewPlaybackControlsArgs = {
  currentTime: number;
  onSeek: (nextTime: number) => void;
};

type UsePreviewPlaybackControlsResult = {
  skipSeconds: number;
  stepBy: (deltaSeconds: number) => void;
  handleSkipContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
};

const usePreviewPlaybackControls = ({
  currentTime,
  onSeek
}: UsePreviewPlaybackControlsArgs): UsePreviewPlaybackControlsResult => {
  const [skipSeconds, setSkipSeconds] = useState(5);

  const stepBy = useCallback(
    (deltaSeconds: number) => {
      onSeek(currentTime + deltaSeconds);
    },
    [currentTime, onSeek]
  );

  const cycleSkipSeconds = useCallback(() => {
    setSkipSeconds((value) => (value >= 5 ? 1 : value + 1));
  }, []);

  const handleSkipContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      cycleSkipSeconds();
    },
    [cycleSkipSeconds]
  );

  return { skipSeconds, stepBy, handleSkipContextMenu };
};

export default usePreviewPlaybackControls;
