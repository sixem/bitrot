import type { ModeCatalogEntry, ModeConfigMap, ModeId } from "@/modes/definitions";
import ModeConfigEditor from "@/editor/ModeConfigEditor";

// Details column for the mode browser modal.
type ModeSelectDetailsProps = {
  mode: ModeCatalogEntry;
  engineTone: "native" | "ffmpeg";
  config: ModeConfigMap[ModeId];
  configFields: NonNullable<ModeCatalogEntry["configFields"]>;
  hasConfigChanges: boolean;
  onResetDefaults: () => void;
  onConfigChange: (patch: Partial<ModeConfigMap[ModeId]>) => void;
};

const ModeSelectDetails = ({
  mode,
  engineTone,
  config,
  configFields,
  hasConfigChanges,
  onResetDefaults,
  onConfigChange
}: ModeSelectDetailsProps) => (
  <aside className="mode-modal-details" data-has-config={configFields.length > 0}>
    <div className="mode-modal-details-header">
      <div>
        <p className="mode-modal-details-label">Selected mode</p>
        <h3 className="mode-modal-details-title">{mode.label}</h3>
      </div>
      <div className="mode-modal-details-tags">
        <span className="mode-option__tag" data-tone={engineTone}>
          {engineTone === "native" ? "Native" : "FFmpeg"}
        </span>
        {mode.isExperimental && (
          <span className="mode-option__tag" data-tone="muted">
            Beta
          </span>
        )}
      </div>
    </div>
    <div className="mode-modal-details-section mode-modal-details-copy">
      <p className="mode-modal-details-description">{mode.description}</p>
      {mode.details ? (
        <p className="mode-modal-details-text">{mode.details}</p>
      ) : null}
    </div>
    {configFields.length ? (
      <div className="mode-modal-details-section mode-modal-config">
        <div className="mode-modal-config-header">
          <p className="mode-modal-details-label">Configuration</p>
          <button
            className="mode-modal-reset"
            type="button"
            data-visible={hasConfigChanges}
            onClick={onResetDefaults}
            disabled={!hasConfigChanges}
            aria-hidden={!hasConfigChanges}
            tabIndex={hasConfigChanges ? 0 : -1}
          >
            Reset
          </button>
        </div>
        <ModeConfigEditor
          config={config}
          fields={configFields}
          onChange={onConfigChange}
        />
      </div>
    ) : null}
    {mode.tags?.length ? (
      <div className="mode-modal-details-section mode-modal-details-meta">
        <span className="mode-modal-details-label">Tags</span>
        <div className="mode-modal-details-chiplist">
          {mode.tags.map((tag) => (
            <span key={tag} className="mode-option__chip">
              {tag}
            </span>
          ))}
        </div>
      </div>
    ) : null}
  </aside>
);

export default ModeSelectDetails;
