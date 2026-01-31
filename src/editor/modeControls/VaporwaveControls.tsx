import type { VaporwaveConfig } from "@/modes/vaporwave";

type VaporwaveControlsProps = {
  config: VaporwaveConfig;
  onChange: (patch: Partial<VaporwaveConfig>) => void;
  disabled?: boolean;
};

// Controls for the vaporwave palette remap mode.
const VaporwaveControls = ({
  config,
  onChange,
  disabled
}: VaporwaveControlsProps) => (
  <div className="mode-controls">
    <label className="mode-control">
      <span className="mode-control-label">Intensity</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={100}
        value={config.intensity}
        onChange={(event) =>
          onChange({ intensity: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.intensity}%</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Black cutoff</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.blackThreshold}
        onChange={(event) =>
          onChange({ blackThreshold: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.blackThreshold}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Cyan band max</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.cyanMax}
        onChange={(event) => onChange({ cyanMax: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.cyanMax}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Magenta band max</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.magentaMax}
        onChange={(event) =>
          onChange({ magentaMax: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.magentaMax}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Purple band max</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.purpleMax}
        onChange={(event) =>
          onChange({ purpleMax: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.purpleMax}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Teal band max</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.tealMax}
        onChange={(event) => onChange({ tealMax: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.tealMax}</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">White cutoff</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={255}
        step={1}
        value={config.whiteThreshold}
        onChange={(event) =>
          onChange({ whiteThreshold: Number(event.target.value) })
        }
        disabled={disabled}
      />
      <span className="mode-control-value">{config.whiteThreshold}</span>
    </label>
  </div>
);

export default VaporwaveControls;
