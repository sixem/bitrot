import type { DatamoshConfig } from "@/modes/datamosh";

type DatamoshControlsProps = {
  config: DatamoshConfig;
  onChange: (patch: Partial<DatamoshConfig>) => void;
  disabled?: boolean;
};

// Controls for the datamosh mode.
const DatamoshControls = ({ config, onChange, disabled }: DatamoshControlsProps) => (
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
      <span className="mode-control-label">Mosh length</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={config.moshLengthSeconds}
        onChange={(event) =>
          onChange({ moshLengthSeconds: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">
        {config.moshLengthSeconds <= 0
          ? "Infinite (to end)"
          : `${config.moshLengthSeconds.toFixed(1)}s`}
      </span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Scene threshold</span>
      <input
        className="mode-slider"
        type="range"
        min={0.05}
        max={0.6}
        step={0.05}
        value={config.sceneThreshold}
        onChange={(event) =>
          onChange({ sceneThreshold: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.sceneThreshold.toFixed(2)}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">GOP size</span>
      <input
        className="mode-input"
        type="number"
        min={30}
        max={600}
        step={1}
        value={config.gopSize}
        onChange={(event) => onChange({ gopSize: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">frames</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Seed</span>
      <input
        className="mode-input"
        type="number"
        min={0}
        max={9999}
        step={1}
        value={config.seed}
        onChange={(event) => onChange({ seed: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">rng</span>
    </label>
  </div>
);

export default DatamoshControls;
