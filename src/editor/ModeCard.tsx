import type { ChangeEvent } from "react";
import type { GlitchConfig } from "@/modes/glitch";
import type { VhsConfig } from "@/modes/vhs";
import type { DatablendConfig } from "@/modes/datablend";
import type { PixelsortConfig } from "@/modes/pixelsort";
import type { DatamoshConfig } from "@/modes/datamosh";
import {
  MODE_DEFINITIONS,
  getModeDefinition,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import {
  DatablendControls,
  DatamoshControls,
  GlitchControls,
  PixelsortControls,
  VhsControls
} from "@/editor/modeControls";

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

// Selectable mode card for the processing workflow.
const ModeCard = ({
  value,
  onChange,
  config,
  onConfigChange,
  disabled
}: ModeCardProps) => {
  const activeMode = getModeDefinition(value);
  const engineTag: ModeEngineTag =
    activeMode.engine === "native"
      ? { label: "Native", tone: "native" }
      : { label: "FFmpeg", tone: "ffmpeg" };

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

  const modeControls = (() => {
    if (value === "vhs") {
      return (
        <VhsControls
          config={config as VhsConfig}
          onChange={handleVhsConfigChange}
          disabled={disabled}
        />
      );
    }
    if (value === "glitch") {
      return (
        <GlitchControls
          config={config as GlitchConfig}
          onChange={handleGlitchConfigChange}
          disabled={disabled}
        />
      );
    }
    if (value === "datablend") {
      return (
        <DatablendControls
          config={config as DatablendConfig}
          onChange={handleDatablendConfigChange}
          disabled={disabled}
        />
      );
    }
    if (value === "pixelsort") {
      return (
        <PixelsortControls
          config={config as PixelsortConfig}
          onChange={handlePixelsortConfigChange}
          disabled={disabled}
        />
      );
    }
    if (value === "datamosh") {
      return (
        <DatamoshControls
          config={config as DatamoshConfig}
          onChange={handleDatamoshConfigChange}
          disabled={disabled}
        />
      );
    }
    return null;
  })();

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
      {modeControls}
    </article>
  );
};

export default ModeCard;
