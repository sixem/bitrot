import { useState } from "react";
import type { GlitchConfig } from "@/modes/glitch";
import type { KaleidoscopeConfig } from "@/modes/kaleidoscope";
import type { VhsConfig } from "@/modes/vhs";
import type { DatablendConfig } from "@/modes/datablend";
import type { PixelsortConfig } from "@/modes/pixelsort";
import type { DatamoshConfig } from "@/modes/datamosh";
import type { ModuloMappingConfig } from "@/modes/moduloMapping";
import type { BlockShiftConfig } from "@/modes/blockShift";
import type { VaporwaveConfig } from "@/modes/vaporwave";
import { getModeDefinition, type ModeConfigMap, type ModeId } from "@/modes/definitions";
import {
  ModuloMappingControls,
  BlockShiftControls,
  DatablendControls,
  DatamoshControls,
  GlitchControls,
  KaleidoscopeControls,
  PixelsortControls,
  VhsControls,
  VaporwaveControls
} from "@/editor/modeControls";
import ModeSelectModal from "@/editor/ModeSelectModal";
type ModeCardProps = {
  value: ModeId;
  onChange: (value: ModeId) => void;
  config: ModeConfigMap[ModeId];
  modeConfigs: ModeConfigMap;
  onConfigChange: (config: ModeConfigMap[ModeId]) => void;
  onModeConfigUpdate: (modeId: ModeId, config: ModeConfigMap[ModeId]) => void;
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
  modeConfigs,
  onConfigChange,
  onModeConfigUpdate,
  disabled
}: ModeCardProps) => {
  const activeMode = getModeDefinition(value);
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);
  const engineTag: ModeEngineTag =
    activeMode.engine === "native"
      ? { label: "Native", tone: "native" }
      : { label: "FFmpeg", tone: "ffmpeg" };

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

  const handleModuloMappingConfigChange = (patch: Partial<ModuloMappingConfig>) => {
    onConfigChange({
      ...(config as ModuloMappingConfig),
      ...patch
    });
  };

  const handleBlockShiftConfigChange = (patch: Partial<BlockShiftConfig>) => {
    onConfigChange({
      ...(config as BlockShiftConfig),
      ...patch
    });
  };

  const handleVaporwaveConfigChange = (patch: Partial<VaporwaveConfig>) => {
    onConfigChange({
      ...(config as VaporwaveConfig),
      ...patch
    });
  };

  const handleKaleidoscopeConfigChange = (patch: Partial<KaleidoscopeConfig>) => {
    onConfigChange({
      ...(config as KaleidoscopeConfig),
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
    if (value === "modulo-mapping") {
      return (
        <ModuloMappingControls
          config={config as ModuloMappingConfig}
          onChange={handleModuloMappingConfigChange}
          disabled={disabled}
        />
      );
    }
    if (value === "block-shift") {
      return (
        <BlockShiftControls
          config={config as BlockShiftConfig}
          onChange={handleBlockShiftConfigChange}
          disabled={disabled}
        />
      );
    }
    if (value === "vaporwave") {
      return (
        <VaporwaveControls
          config={config as VaporwaveConfig}
          onChange={handleVaporwaveConfigChange}
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
    if (value === "kaleidoscope") {
      return (
        <KaleidoscopeControls
          config={config as KaleidoscopeConfig}
          onChange={handleKaleidoscopeConfigChange}
          disabled={disabled}
        />
      );
    }
    return null;
  })();

  return (
    <article className="editor-card editor-mode-card">
      <div className="editor-card-header editor-card-header--mode">
        <div className="editor-card-header-left">
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
        <div className="editor-card-header-right">
          <span className="editor-card-mode-name" title={activeMode.label}>
            {activeMode.label}
          </span>
        </div>
      </div>
      <div className="editor-kv">
        <div className="editor-kv-row editor-kv-row--full">
          <button
            className="editor-button mode-select-button"
            type="button"
            onClick={() => setIsModeModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isModeModalOpen}
            disabled={disabled}
          >
            <span className="mode-select-button__label">Browse modes</span>
            <span className="mode-select-button__hint">View all</span>
          </button>
        </div>
      </div>
      <p className="editor-help">{activeMode.description}</p>
      {modeControls}
      <ModeSelectModal
        isOpen={isModeModalOpen}
        activeModeId={value}
        modeConfigs={modeConfigs}
        onApply={(modeId, nextConfig) => {
          onModeConfigUpdate(modeId, nextConfig);
          onChange(modeId);
        }}
        onClose={() => setIsModeModalOpen(false)}
      />
    </article>
  );
};

export default ModeCard;
