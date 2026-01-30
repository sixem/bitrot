import type { PixelsortConfig, PixelsortDirection } from "@/modes/pixelsort";
import Select from "@/ui/controls/Select";

type PixelsortControlsProps = {
  config: PixelsortConfig;
  onChange: (patch: Partial<PixelsortConfig>) => void;
  disabled?: boolean;
};

const DIRECTION_OPTIONS = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "block", label: "Block" }
];

// Controls for the pixelsort mode.
const PixelsortControls = ({ config, onChange, disabled }: PixelsortControlsProps) => (
  <div className="mode-controls">
    <label className="mode-control">
      <span className="mode-control-label">Intensity</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={100}
        value={config.intensity}
        onChange={(event) => onChange({ intensity: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.intensity}%</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Min threshold</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        value={config.threshold}
        onChange={(event) => onChange({ threshold: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.threshold}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Max threshold</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        value={config.maxThreshold}
        onChange={(event) => onChange({ maxThreshold: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.maxThreshold}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Block size</span>
      <input
        className="mode-slider"
        type="range"
        min={2}
        max={120}
        value={config.blockSize}
        onChange={(event) => onChange({ blockSize: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.blockSize}px</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Direction</span>
      <Select
        className="editor-select"
        value={config.direction}
        onChange={(nextValue) =>
          onChange({ direction: nextValue as PixelsortDirection })
        }
        disabled={disabled}
        options={DIRECTION_OPTIONS}
      />
    </label>
  </div>
);

export default PixelsortControls;
