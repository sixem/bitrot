import type { GlitchConfig } from "@/modes/glitch";

type GlitchControlsProps = {
  config: GlitchConfig;
  onChange: (patch: Partial<GlitchConfig>) => void;
  disabled?: boolean;
};

// Controls for the chroma glitch mode.
const GlitchControls = ({ config, onChange, disabled }: GlitchControlsProps) => (
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
      <span className="mode-control-label">Chroma shift</span>
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
  </div>
);

export default GlitchControls;
