import type { ChangeEvent } from "react";
import type { GlitchConfig } from "@/modes/glitch";
import type { DatamoshConfig } from "@/modes/datamosh";
import {
  MODE_DEFINITIONS,
  getModeDefinition,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";

type ModeCardProps = {
  value: ModeId;
  onChange: (value: ModeId) => void;
  config: ModeConfigMap[ModeId];
  onConfigChange: (config: ModeConfigMap[ModeId]) => void;
  disabled?: boolean;
};

// Selectable mode card for the processing workflow.
const ModeCard = ({
  value,
  onChange,
  config,
  onConfigChange,
  disabled
}: ModeCardProps) => {
  const activeMode = getModeDefinition(value);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as ModeId);
  };

  const handleGlitchConfigChange = (patch: Partial<GlitchConfig>) => {
    onConfigChange({
      ...(config as GlitchConfig),
      ...patch
    });
  };

  const handleDatamoshConfigChange = (patch: Partial<DatamoshConfig>) => {
    onConfigChange({
      ...(config as DatamoshConfig),
      ...patch
    });
  };

  return (
    <article className="editor-card editor-mode-card">
      <div className="editor-card-header">
        <h2 className="editor-card-title">Mode</h2>
        <span className="editor-card-tag">Beta</span>
      </div>
      <div className="editor-kv">
        <div className="editor-kv-row">
          <span className="editor-kv-label">Preset</span>
          <select
            className="editor-select"
            value={value}
            onChange={handleChange}
            disabled={disabled}
          >
            {MODE_DEFINITIONS.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="editor-help">{activeMode.description}</p>
      {value === "glitch" && (
        <div className="mode-controls">
          <label className="mode-control">
            <span className="mode-control-label">Intensity</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as GlitchConfig).intensity}
              onChange={(event) =>
                handleGlitchConfigChange({
                  intensity: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as GlitchConfig).intensity}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Chroma shift</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={8}
              value={(config as GlitchConfig).chromaShift}
              onChange={(event) =>
                handleGlitchConfigChange({
                  chromaShift: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as GlitchConfig).chromaShift}px
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Noise</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={40}
              value={(config as GlitchConfig).noise}
              onChange={(event) =>
                handleGlitchConfigChange({
                  noise: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as GlitchConfig).noise}
            </span>
          </label>
        </div>
      )}
      {value === "datamosh" && (
        <div className="mode-controls">
          <label className="mode-control">
            <span className="mode-control-label">Intensity</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as DatamoshConfig).intensity}
              onChange={(event) =>
                handleDatamoshConfigChange({
                  intensity: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as DatamoshConfig).intensity}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Mosh length</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={10}
              step={0.1}
              value={(config as DatamoshConfig).moshLengthSeconds}
              onChange={(event) =>
                handleDatamoshConfigChange({
                  moshLengthSeconds: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as DatamoshConfig).moshLengthSeconds <= 0
                ? "Infinite (to end)"
                : `${(config as DatamoshConfig).moshLengthSeconds.toFixed(1)}s`}
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
              value={(config as DatamoshConfig).sceneThreshold}
              onChange={(event) =>
                handleDatamoshConfigChange({
                  sceneThreshold: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as DatamoshConfig).sceneThreshold.toFixed(2)}
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">GOP size</span>
            <input
              className="mode-input"
              type="number"
              min={30}
              max={600}
              step={1}
              value={(config as DatamoshConfig).gopSize}
              onChange={(event) =>
                handleDatamoshConfigChange({
                  gopSize: Number(event.target.value)
                })
              }
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
              value={(config as DatamoshConfig).seed}
              onChange={(event) =>
                handleDatamoshConfigChange({
                  seed: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">rng</span>
          </label>
        </div>
      )}
    </article>
  );
};

export default ModeCard;
