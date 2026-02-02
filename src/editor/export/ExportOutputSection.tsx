// Output path inputs + resolved destination display.
import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import makeDebug from "@/utils/debug";
import type { ExportSettings } from "@/editor/ExportModal";

type ExportOutputSectionProps = {
  settings: ExportSettings;
  outputPath: string;
  onChange: (next: ExportSettings) => void;
};

const debug = makeDebug("export-output");

const ExportOutputSection = ({
  settings,
  outputPath,
  onChange
}: ExportOutputSectionProps) => {
  // Provide a directory picker alongside manual path entry.
  const handleBrowseFolder = useCallback(async () => {
    try {
      const selection = await open({
        title: "Select output folder",
        directory: true,
        multiple: false
      });
      if (!selection) {
        return;
      }
      const folder = Array.isArray(selection) ? selection[0] : selection;
      if (typeof folder !== "string" || folder.length === 0) {
        return;
      }
      onChange({ ...settings, folder });
    } catch (error) {
      debug("output folder browse failed: %O", error);
    }
  }, [onChange, settings]);

  return (
    <div className="export-section export-section--wide">
      <div className="export-section-header">Output</div>
      <div className="export-grid export-grid--output">
        <label className="export-field">
          <span className="export-label">Output folder</span>
          <div className="export-input-row">
            <input
              className="export-input"
              type="text"
              value={settings.folder}
              onChange={(event) =>
                onChange({ ...settings, folder: event.target.value })
              }
              placeholder="Folder path"
            />
            <button
              className="ui-button export-input-action"
              type="button"
              onClick={handleBrowseFolder}
              aria-label="Browse for output folder"
              title="Browse for output folder"
            >
              <svg
                className="export-input-icon"
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M0 1H5L8 3H13V5H3.7457L2.03141 11H4.11144L5.2543 7H16L14 14H0V1Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
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
};

export default ExportOutputSection;
