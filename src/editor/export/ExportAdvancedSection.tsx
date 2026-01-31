// Advanced encoder overrides + generated args preview.
type ExportAdvancedSectionProps = {
  extraArgs: string;
  argsPreview: string;
  onExtraArgsChange: (next: string) => void;
};

const ExportAdvancedSection = ({
  extraArgs,
  argsPreview,
  onExtraArgsChange
}: ExportAdvancedSectionProps) => (
  <div className="export-section export-section--wide">
    <div className="export-section-header">Advanced</div>
    <label className="export-field">
      <span className="export-label">Extra ffmpeg args (safe)</span>
      <textarea
        className="export-input export-textarea"
        value={extraArgs}
        onChange={(event) => onExtraArgsChange(event.target.value)}
        placeholder="Example: -tune film -profile:v high"
      />
      <p className="export-help">
        Unsupported or unsafe args are ignored. Common flags: -tune, -profile:v,
        -level, -threads, -row-mt.
      </p>
    </label>
    <div className="export-args">
      <span className="export-label">Generated args</span>
      <code>{argsPreview || "--"}</code>
    </div>
  </div>
);

export default ExportAdvancedSection;
