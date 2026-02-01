import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  MODE_CATALOG,
  getModeDefinition,
  cloneModeConfigs,
  type ModeConfigMap,
  type ModeId
} from "@/modes/definitions";
import { buildModeSearchText, isModeConfigEqual } from "@/modes/modeUtils";
import ModeSelectDetails from "@/editor/modeSelect/ModeSelectDetails";
import ModeSelectList from "@/editor/modeSelect/ModeSelectList";
import useModalScrollLock from "@/ui/modal/useModalScrollLock";

// MODE_CATALOG is static, so cache each mode's search text once per module load.
const MODE_SEARCH_TEXT = new Map(
  MODE_CATALOG.map((mode) => [mode.id, buildModeSearchText(mode)])
);

type ModeSelectModalProps = {
  isOpen: boolean;
  activeModeId: ModeId;
  modeConfigs: ModeConfigMap;
  onClose: () => void;
  onApply: (modeId: ModeId, config: ModeConfigMap[ModeId]) => void;
};

// Mode browser modal coordinates search, selection, and draft config edits.
// - search filters the catalog list
// - selection drives the detail panel
// - draft configs stay local until Apply (or Reset) commits them
const ModeSelectModal = ({
  isOpen,
  activeModeId,
  modeConfigs,
  onClose,
  onApply
}: ModeSelectModalProps) => {
  const shouldCloseRef = useRef(false);
  useModalScrollLock(isOpen);
  const [search, setSearch] = useState("");
  const [selectedModeId, setSelectedModeId] = useState<ModeId>(activeModeId);
  // Selection updates the detail pane; drafts keep edits local until Apply commits them.
  const [draftConfigs, setDraftConfigs] = useState<ModeConfigMap>(() =>
    cloneModeConfigs(modeConfigs)
  );

  // Reset modal state on open so the active mode is always the starting point.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSearch("");
    setSelectedModeId(activeModeId);
    setDraftConfigs(cloneModeConfigs(modeConfigs));
  }, [activeModeId, isOpen, modeConfigs]);

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

  const searchLabel = search.trim();
  const filteredModes = useMemo(() => {
    const query = searchLabel.toLowerCase();
    if (!query) {
      return MODE_CATALOG;
    }
    return MODE_CATALOG.filter((mode) =>
      (MODE_SEARCH_TEXT.get(mode.id) ?? "").includes(query)
    );
  }, [searchLabel]);

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
  const selectedDefinition = getModeDefinition(selectedModeId);
  const selectedEngineTone = selectedMode.engine === "native" ? "native" : "ffmpeg";
  const selectedConfig =
    draftConfigs[selectedModeId] ??
    modeConfigs[selectedModeId] ??
    selectedDefinition.defaultConfig;
  const selectedConfigFields = selectedMode.configFields ?? [];
  const hasConfigChanges =
    selectedConfigFields.length > 0 &&
    !isModeConfigEqual(selectedConfig, selectedDefinition.defaultConfig);

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

  const applyMode = (modeId: ModeId) => {
    const definition = getModeDefinition(modeId);
    const config = draftConfigs[modeId] ?? modeConfigs[modeId] ?? definition.defaultConfig;
    onApply(modeId, config);
    onClose();
  };

  const handleApply = () => {
    applyMode(selectedModeId);
  };

  const handleConfigChange = (patch: Partial<ModeConfigMap[ModeId]>) => {
    setDraftConfigs((prev) => ({
      ...prev,
      [selectedModeId]: {
        ...(prev[selectedModeId] as ModeConfigMap[ModeId]),
        ...patch
      }
    }));
  };

  const handleResetDefaults = () => {
    setDraftConfigs((prev) => ({
      ...prev,
      [selectedModeId]: { ...selectedDefinition.defaultConfig }
    }));
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
          <ModeSelectList
            modes={filteredModes}
            searchLabel={searchLabel}
            selectedModeId={selectedModeId}
            activeModeId={activeModeId}
            onSelect={setSelectedModeId}
            onApply={applyMode}
          />

          <ModeSelectDetails
            mode={selectedMode}
            engineTone={selectedEngineTone}
            config={selectedConfig}
            configFields={selectedConfigFields}
            hasConfigChanges={hasConfigChanges}
            onResetDefaults={handleResetDefaults}
            onConfigChange={handleConfigChange}
          />
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
