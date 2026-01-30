import type { ChangeEvent } from "react";

// Shows trim range details and volume control.
type PreviewRangeProps = {
  isActive: boolean;
  infoLines: string[];
  volumePercent: number;
  onVolumeChange: (nextVolume: number) => void;
  isDisabled: boolean;
};

const PreviewRange = ({
  isActive,
  infoLines,
  volumePercent,
  onVolumeChange,
  isDisabled
}: PreviewRangeProps) => {
  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(Number(event.target.value) / 100);
  };

  return (
    <div className="preview-range" data-active={isActive}>
      <div className="preview-range-info">
        {infoLines.length > 0 ? (
          infoLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))
        ) : (
          <span>No selection</span>
        )}
      </div>
      <div className="preview-audio">
        <span className="preview-audio-label">Volume</span>
        <input
          className="preview-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          onChange={handleVolumeChange}
          disabled={isDisabled}
          aria-label="Preview volume"
        />
        <span className="preview-audio-value">{volumePercent}%</span>
      </div>
    </div>
  );
};

export default PreviewRange;
