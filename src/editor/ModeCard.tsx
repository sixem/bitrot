import type { ChangeEvent } from "react";
import type { GlitchConfig } from "@/modes/glitch";
import type { VhsConfig } from "@/modes/vhs";
import type { DatablendConfig, DatablendBlendMode } from "@/modes/datablend";
import type { PixelsortConfig, PixelsortDirection } from "@/modes/pixelsort";
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

type ModeEngineTag = {
  label: string;
  tone: "ffmpeg" | "native";
};

const getModeEngineTag = (modeId: ModeId): ModeEngineTag => {
  if (modeId === "pixelsort") {
    return { label: "Native", tone: "native" };
  }
  return { label: "FFmpeg", tone: "ffmpeg" };
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
  const engineTag = getModeEngineTag(value);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as ModeId);
  };

  const handleGlitchConfigChange = (patch: Partial<GlitchConfig>) => {
    onConfigChange({
      ...(config as GlitchConfig),
      ...patch
    });
  };

  const handleVhsConfigChange = (patch: Partial<VhsConfig>) => {
    onConfigChange({
      ...(config as VhsConfig),
      ...patch
    });
  };

  const handleDatablendConfigChange = (patch: Partial<DatablendConfig>) => {
    onConfigChange({
      ...(config as DatablendConfig),
      ...patch
    });
  };

  const handlePixelsortConfigChange = (patch: Partial<PixelsortConfig>) => {
    onConfigChange({
      ...(config as PixelsortConfig),
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
        <div className="editor-card-tags">
          {activeMode.isExperimental && (
            <span className="editor-card-tag" data-tone="beta">
              Beta
            </span>
          )}
          <span className="editor-card-tag" data-tone={engineTag.tone}>
            {engineTag.label}
          </span>
        </div>
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
      {value === "vhs" && (
        <div className="mode-controls">
          <label className="mode-control">
            <span className="mode-control-label">Intensity</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as VhsConfig).intensity}
              onChange={(event) =>
                handleVhsConfigChange({
                  intensity: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as VhsConfig).intensity}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Tracking</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as VhsConfig).tracking}
              onChange={(event) =>
                handleVhsConfigChange({
                  tracking: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as VhsConfig).tracking}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Chroma bleed</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={8}
              value={(config as VhsConfig).chromaShift}
              onChange={(event) =>
                handleVhsConfigChange({
                  chromaShift: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as VhsConfig).chromaShift}px
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Noise</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={40}
              value={(config as VhsConfig).noise}
              onChange={(event) =>
                handleVhsConfigChange({
                  noise: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as VhsConfig).noise}
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Softness</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as VhsConfig).smear}
              onChange={(event) =>
                handleVhsConfigChange({
                  smear: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as VhsConfig).smear}%
            </span>
          </label>
        </div>
      )}
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
      {value === "datablend" && (
        <div className="mode-controls">
          <label className="mode-control">
            <span className="mode-control-label">Intensity</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as DatablendConfig).intensity}
              onChange={(event) =>
                handleDatablendConfigChange({
                  intensity: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as DatablendConfig).intensity}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Trail</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as DatablendConfig).trail}
              onChange={(event) =>
                handleDatablendConfigChange({
                  trail: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as DatablendConfig).trail}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Blend mode</span>
            <select
              className="editor-select"
              value={(config as DatablendConfig).blendMode}
              onChange={(event) =>
                handleDatablendConfigChange({
                  blendMode: event.target.value as DatablendBlendMode
                })
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
      )}
      {value === "pixelsort" && (
        <div className="mode-controls">
          <label className="mode-control">
            <span className="mode-control-label">Intensity</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as PixelsortConfig).intensity}
              onChange={(event) =>
                handlePixelsortConfigChange({
                  intensity: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as PixelsortConfig).intensity}%
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Min threshold</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={255}
              value={(config as PixelsortConfig).threshold}
              onChange={(event) =>
                handlePixelsortConfigChange({
                  threshold: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as PixelsortConfig).threshold}
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Max threshold</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={255}
              value={(config as PixelsortConfig).maxThreshold}
              onChange={(event) =>
                handlePixelsortConfigChange({
                  maxThreshold: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as PixelsortConfig).maxThreshold}
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Block size</span>
            <input
              className="mode-slider"
              type="range"
              min={2}
              max={120}
              value={(config as PixelsortConfig).blockSize}
              onChange={(event) =>
                handlePixelsortConfigChange({
                  blockSize: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as PixelsortConfig).blockSize}px
            </span>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Direction</span>
            <select
              className="editor-select"
              value={(config as PixelsortConfig).direction}
              onChange={(event) =>
                handlePixelsortConfigChange({
                  direction: event.target.value as PixelsortDirection
                })
              }
              disabled={disabled}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="block">Block</option>
            </select>
          </label>
          <label className="mode-control">
            <span className="mode-control-label">Noise</span>
            <input
              className="mode-slider"
              type="range"
              min={0}
              max={100}
              value={(config as PixelsortConfig).noise}
              onChange={(event) =>
                handlePixelsortConfigChange({
                  noise: Number(event.target.value)
                })
              }
              disabled={disabled}
            />
            <span className="mode-control-value">
              {(config as PixelsortConfig).noise}%
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
