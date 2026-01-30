import type { CSSProperties, ChangeEvent } from "react";

// Range input for scrubbing through the preview timeline.
type PreviewScrubberProps = {
  value: number;
  max: number;
  step: number;
  isDisabled: boolean;
  trimTrack?: string;
  onChange: (value: number) => void;
};

const PreviewScrubber = ({
  value,
  max,
  step,
  isDisabled,
  trimTrack,
  onChange
}: PreviewScrubberProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <input
      className="preview-scrub range-input"
      type="range"
      min={0}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      disabled={isDisabled}
      aria-label="Scrub preview"
      style={trimTrack ? ({ "--scrub-track": trimTrack } as CSSProperties) : undefined}
    />
  );
};

export default PreviewScrubber;
