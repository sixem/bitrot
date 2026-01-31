// Header row for the export modal, including preset selection.
import type { ReactNode } from "react";
import Select from "@/ui/controls/Select";
import type { ExportPresetId } from "@/jobs/exportPresets";

type ExportPresetHeaderProps = {
  presetOptions: Array<{ value: ExportPresetId; label: ReactNode }>;
  presetId: ExportPresetId;
  presetDescription: string;
  onPresetChange: (nextPresetId: ExportPresetId) => void;
};

const ExportPresetHeader = ({
  presetOptions,
  presetId,
  presetDescription,
  onPresetChange
}: ExportPresetHeaderProps) => (
  <div className="export-title">
    <div className="export-title-main">
      <h2 id="export-modal-title" className="modal-title">
        Export settings
      </h2>
    </div>
    <div className="export-title-side">
      <div className="export-preset">
        <Select
          className="export-input export-select export-select--preset"
          value={presetId}
          ariaLabel="Export preset"
          options={presetOptions}
          onChange={(nextValue) => onPresetChange(nextValue as ExportPresetId)}
        />
        <p className="export-help export-help--tight">{presetDescription}</p>
      </div>
    </div>
  </div>
);

export default ExportPresetHeader;
