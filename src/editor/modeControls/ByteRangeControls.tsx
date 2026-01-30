import type { ModuloMappingConfig } from "@/modes/moduloMapping";

type ModuloMappingControlsProps = {
  config: ModuloMappingConfig;
  onChange: (patch: Partial<ModuloMappingConfig>) => void;
  disabled?: boolean;
};

// Controls for the modulo mapping mode.
// File name retained to avoid a wide rename across the repo.
const ModuloMappingControls = ({
  config,
  onChange,
  disabled
}: ModuloMappingControlsProps) => (
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
      <span className="mode-control-label">Modulus</span>
      <input
        className="mode-slider"
        type="range"
        min={2}
        max={256}
        step={1}
        value={config.modulus}
        onChange={(event) => onChange({ modulus: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.modulus}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Stride</span>
      <input
        className="mode-slider"
        type="range"
        min={1}
        max={32}
        step={1}
        value={config.stride}
        onChange={(event) => onChange({ stride: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.stride}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Offset</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.offset}
        onChange={(event) => onChange({ offset: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.offset}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Seed</span>
      <input
        className="mode-input"
        type="number"
        min={0}
        value={config.seed}
        onChange={(event) => onChange({ seed: Number(event.target.value) })}
        disabled={disabled}
      />
    </label>
  </div>
);

export default ModuloMappingControls;
