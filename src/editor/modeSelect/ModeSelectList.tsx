import type { ModeCatalogEntry, ModeId } from "@/modes/definitions";

// Mode list column for the mode browser modal.
type ModeSelectListProps = {
  modes: ModeCatalogEntry[];
  searchLabel: string;
  selectedModeId: ModeId;
  activeModeId: ModeId;
  onSelect: (modeId: ModeId) => void;
  onApply: (modeId: ModeId) => void;
};

const ModeSelectList = ({
  modes,
  searchLabel,
  selectedModeId,
  activeModeId,
  onSelect,
  onApply
}: ModeSelectListProps) => (
  <div className="mode-modal-list scrollable" role="listbox" aria-label="Modes">
    {modes.length === 0 ? (
      <p className="mode-modal-empty">No modes match "{searchLabel}".</p>
    ) : (
      modes.map((mode) => {
        const isSelected = mode.id === selectedModeId;
        const isCurrent = mode.id === activeModeId;
        const engineTone = mode.engine === "native" ? "native" : "ffmpeg";
        return (
          <button
            key={mode.id}
            type="button"
            className="mode-option"
            role="option"
            aria-selected={isSelected}
            data-selected={isSelected}
            data-current={isCurrent}
            data-engine={engineTone}
            onClick={() => onSelect(mode.id)}
            onDoubleClick={() => onApply(mode.id)}
          >
            <div className="mode-option__header">
              <span className="mode-option__label">{mode.label}</span>
              <div className="mode-option__tags">
                {isCurrent && (
                  <span className="mode-option__tag" data-tone="current">
                    Current
                  </span>
                )}
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
            <p className="mode-option__description">{mode.description}</p>
            {mode.tags?.length ? (
              <div className="mode-option__meta">
                {mode.tags.map((tag) => (
                  <span key={tag} className="mode-option__chip">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        );
      })
    )}
  </div>
);

export default ModeSelectList;
