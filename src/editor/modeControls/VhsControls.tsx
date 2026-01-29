import type { VhsConfig } from "@/modes/vhs";

type VhsControlsProps = {
  config: VhsConfig;
  onChange: (patch: Partial<VhsConfig>) => void;
  disabled?: boolean;
};

// Controls for the VHS mode.
const VhsControls = ({ config, onChange, disabled }: VhsControlsProps) => (
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
      <span className="mode-control-label">Tracking</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={100}
        value={config.tracking}
        onChange={(event) => onChange({ tracking: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.tracking}%</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Chroma bleed</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={8}
        value={config.chromaShift}
        onChange={(event) => onChange({ chromaShift: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.chromaShift}px</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Noise</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={40}
        value={config.noise}
        onChange={(event) => onChange({ noise: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.noise}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Softness</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={100}
        value={config.smear}
        onChange={(event) => onChange({ smear: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.smear}%</span>
    </label>
  </div>
);

export default VhsControls;
