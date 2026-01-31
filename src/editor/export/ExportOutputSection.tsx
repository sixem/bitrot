// Output path inputs + resolved destination display.
import type { ExportSettings } from "@/editor/ExportModal";

type ExportOutputSectionProps = {
  settings: ExportSettings;
  outputPath: string;
  onChange: (next: ExportSettings) => void;
};

const ExportOutputSection = ({
  settings,
  outputPath,
  onChange
}: ExportOutputSectionProps) => (
  <div className="export-section export-section--wide">
    <div className="export-section-header">Output</div>
    <div className="export-grid export-grid--output">
      <label className="export-field">
        <span className="export-label">Output folder</span>
        <input
          className="export-input"
          type="text"
          value={settings.folder}
          onChange={(event) =>
            onChange({ ...settings, folder: event.target.value })
          }
          placeholder="Folder path"
        />
      </label>
      <label className="export-field">
        <span className="export-label">File name</span>
        <input
          className="export-input"
          type="text"
          value={settings.fileName}
          onChange={(event) =>
            onChange({ ...settings, fileName: event.target.value })
          }
          placeholder="output.bitrot.mp4"
        />
      </label>
    </div>
    <p className="export-path" title={outputPath}>
      {outputPath || "Output path will appear here."}
    </p>
  </div>
);

export default ExportOutputSection;
