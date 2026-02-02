import type { KaleidoscopeConfig } from "@/modes/kaleidoscope";

type KaleidoscopeControlsProps = {
  config: KaleidoscopeConfig;
  onChange: (patch: Partial<KaleidoscopeConfig>) => void;
  disabled?: boolean;
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

// Controls for the kaleidoscope mode.
const KaleidoscopeControls = ({
  config,
  onChange,
  disabled
}: KaleidoscopeControlsProps) => (
  <div className="mode-controls">
    <label className="mode-control">
      <span className="mode-control-label">Sectors</span>
      <input
        className="mode-slider"
        type="range"
        min={2}
        max={16}
        step={1}
        value={config.sectors}
        onChange={(event) => onChange({ sectors: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.sectors}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Rotation</span>
      <input
        className="mode-slider"
        type="range"
        min={-180}
        max={180}
        step={1}
        value={config.rotationDegrees}
        onChange={(event) =>
          onChange({ rotationDegrees: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.rotationDegrees}°</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Center X</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={config.centerX}
        onChange={(event) => onChange({ centerX: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{formatPercent(config.centerX)}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Center Y</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={config.centerY}
        onChange={(event) => onChange({ centerY: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{formatPercent(config.centerY)}</span>
    </label>
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
  </div>
);

export default KaleidoscopeControls;
