import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  MODE_CATALOG,
  type ModeCatalogEntry,
  type ModeId
} from "@/modes/definitions";
import useModalScrollLock from "@/ui/modal/useModalScrollLock";

type ModeSelectModalProps = {
  isOpen: boolean;
  activeModeId: ModeId;
  onClose: () => void;
  onSelect: (modeId: ModeId) => void;
};

// Flatten mode metadata into a lowercase search string for fuzzy-ish matching.
const buildSearchText = (mode: ModeCatalogEntry) =>
  [
    mode.label,
    mode.description,
    mode.details,
    mode.engine,
    ...(mode.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// Full-screen-ish mode browser that previews and applies mode selection.
const ModeSelectModal = ({
  isOpen,
  activeModeId,
  onClose,
  onSelect
}: ModeSelectModalProps) => {
  const shouldCloseRef = useRef(false);
  useModalScrollLock(isOpen);
  const [search, setSearch] = useState("");
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(activeModeId);

  // Reset modal state on open so the active mode is always the starting point.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSearch("");
    setSelectedModeId(activeModeId);
  }, [activeModeId, isOpen]);

  // Keep focus on visible results when the current selection disappears.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredModes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return MODE_CATALOG;
    }
    return MODE_CATALOG.filter((mode) => buildSearchText(mode).includes(query));
  }, [search]);

  useEffect(() => {
    if (!isOpen || filteredModes.length === 0) {
      return;
    }
    const isSelectedVisible = filteredModes.some(
      (mode) => mode.id === selectedModeId
    );
    if (!isSelectedVisible) {
      setSelectedModeId(filteredModes[0].id);
    }
  }, [filteredModes, isOpen, selectedModeId]);

  const selectedMode =
    MODE_CATALOG.find((mode) => mode.id === selectedModeId) ?? MODE_CATALOG[0];
  const selectedEngineTone = selectedMode.engine === "native" ? "native" : "ffmpeg";

  if (!isOpen) {
    return null;
  }

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    shouldCloseRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const shouldClose =
      shouldCloseRef.current && event.target === event.currentTarget;
    shouldCloseRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };

  const handleApply = () => {
    onSelect(selectedModeId);
    onClose();
  };

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="modal mode-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-modal-title"
        onMouseDown={() => {
          shouldCloseRef.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mode-modal-header">
          <div className="mode-modal-heading">
            <h2 id="mode-modal-title" className="modal-title">
              Mode browser
            </h2>
            <p className="mode-modal-subtitle">
              Scan all modes, preview their intent, and apply with one click.
            </p>
          </div>
          <label className="mode-modal-search">
            <span className="export-label">Search</span>
            <input
              className="export-input mode-modal-search-input"
              type="search"
              placeholder="Search modes, tags, details"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="mode-modal-body">
          <div className="mode-modal-list scrollable" role="listbox" aria-label="Modes">
            {filteredModes.length === 0 ? (
              <p className="mode-modal-empty">
                No modes match "{search.trim()}".
              </p>
            ) : (
              filteredModes.map((mode) => {
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
                    onClick={() => setSelectedModeId(mode.id)}
                  >
                    <div className="mode-option__header">
                      <span className="mode-option__label">{mode.label}</span>
                      <div className="mode-option__tags">
                        {isCurrent && (
                          <span className="mode-option__tag" data-tone="accent">
                            Current
                          </span>
                        )}
                        {mode.isExperimental && (
                          <span className="mode-option__tag" data-tone="muted">
                            Beta
                          </span>
                        )}
                        <span className="mode-option__tag" data-tone={engineTone}>
                          {engineTone === "native" ? "Native" : "FFmpeg"}
                        </span>
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

          <aside className="mode-modal-details">
            <div className="mode-modal-details-header">
              <div>
                <p className="mode-modal-details-label">Selected mode</p>
                <h3 className="mode-modal-details-title">{selectedMode.label}</h3>
              </div>
              <div className="mode-modal-details-tags">
                {selectedMode.isExperimental && (
                  <span className="mode-option__tag" data-tone="muted">
                    Beta
                  </span>
                )}
                <span className="mode-option__tag" data-tone={selectedEngineTone}>
                  {selectedEngineTone === "native" ? "Native" : "FFmpeg"}
                </span>
              </div>
            </div>
            <p className="mode-modal-details-description">
              {selectedMode.description}
            </p>
            {selectedMode.details ? (
              <p className="mode-modal-details-text">{selectedMode.details}</p>
            ) : null}
            {selectedMode.tags?.length ? (
              <div className="mode-modal-details-meta">
                <span className="mode-modal-details-label">Tags</span>
                <div className="mode-modal-details-chiplist">
                  {selectedMode.tags.map((tag) => (
                    <span key={tag} className="mode-option__chip">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="mode-modal-actions">
          <button className="modal-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-button modal-button--primary"
            type="button"
            onClick={handleApply}
          >
            Apply mode
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModeSelectModal;
