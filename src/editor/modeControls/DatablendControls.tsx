import type { DatablendBlendMode, DatablendConfig } from "@/modes/datablend";

type DatablendControlsProps = {
  config: DatablendConfig;
  onChange: (patch: Partial<DatablendConfig>) => void;
  disabled?: boolean;
};

// Controls for the datablend mode.
const DatablendControls = ({ config, onChange, disabled }: DatablendControlsProps) => (
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
      <span className="mode-control-label">Trail</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={100}
        value={config.trail}
        onChange={(event) => onChange({ trail: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.trail}%</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Blend mode</span>
      <select
        className="editor-select"
        value={config.blendMode}
        onChange={(event) =>
          onChange({ blendMode: event.target.value as DatablendBlendMode })
        }
        disabled={disabled}
      >
        <option value="difference">Difference</option>
        <option value="screen">Screen</option>
        <option value="multiply">Multiply</option>
        <option value="overlay">Overlay</option>
      </select>
    </label>
  </div>
);

export default DatablendControls;
