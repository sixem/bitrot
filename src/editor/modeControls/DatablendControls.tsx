import type { DatablendBlendMode, DatablendConfig } from "@/modes/datablend";
import Select from "@/ui/controls/Select";

type DatablendControlsProps = {
  config: DatablendConfig;
  onChange: (patch: Partial<DatablendConfig>) => void;
  disabled?: boolean;
};

const BLEND_MODE_OPTIONS = [
  { value: "difference", label: "Difference" },
  { value: "screen", label: "Screen" },
  { value: "multiply", label: "Multiply" },
  { value: "overlay", label: "Overlay" }
];

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
      <Select
        className="editor-select"
        value={config.blendMode}
        onChange={(nextValue) =>
          onChange({ blendMode: nextValue as DatablendBlendMode })
        }
        disabled={disabled}
        options={BLEND_MODE_OPTIONS}
      />
    </label>
  </div>
);

export default DatablendControls;
