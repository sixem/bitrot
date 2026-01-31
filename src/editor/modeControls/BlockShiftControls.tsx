import type { BlockShiftConfig } from "@/modes/blockShift";

type BlockShiftControlsProps = {
  config: BlockShiftConfig;
  onChange: (patch: Partial<BlockShiftConfig>) => void;
  disabled?: boolean;
};

// Controls for macroblock-style block shifting.
const BlockShiftControls = ({
  config,
  onChange,
  disabled
}: BlockShiftControlsProps) => (
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
      <span className="mode-control-label">Block size</span>
      <input
        className="mode-slider"
        type="range"
        min={4}
        max={64}
        step={4}
        value={config.blockSize}
        onChange={(event) => onChange({ blockSize: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.blockSize}px</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Max offset</span>
      <input
        className="mode-slider"
        type="range"
        min={0}
        max={64}
        step={1}
        value={config.maxOffset}
        onChange={(event) => onChange({ maxOffset: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.maxOffset}px</span>
    </label>
    <label className="mode-control">
      <span className="mode-control-label">Offset step</span>
      <input
        className="mode-slider"
        type="range"
        min={1}
        max={32}
        step={1}
        value={config.offsetStep}
        onChange={(event) => onChange({ offsetStep: Number(event.target.value) })}
        disabled={disabled}
      />
      <span className="mode-control-value">{config.offsetStep}px</span>
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

export default BlockShiftControls;
