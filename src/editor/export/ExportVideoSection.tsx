// Format, encoder, and size-cap settings for the export modal.
import Select from "@/ui/controls/Select";
import type {
  ExportFormat,
  ExportProfile,
  PassMode,
  VideoEncoder,
  VideoMode,
  VideoSpeed
} from "@/jobs/exportProfile";

type SelectOption = {
  value: string;
  label: string;
};

type ExportVideoSectionProps = {
  profile: ExportProfile;
  formatOptions: SelectOption[];
  encoderOptions: SelectOption[];
  speedOptions: SelectOption[];
  passModeOptions: SelectOption[];
  qualityRange: { min: number; max: number; step: number };
  qualityLabel: string;
  isVp9: boolean;
  sizeCapSelection: string;
  sizeCapSelectOptions: SelectOption[];
  customSizeCapLabel: string;
  customSizeCapValue: string;
  customInputActive: boolean;
  videoMode: VideoMode;
  canUsePassthrough: boolean;
  videoModeOptions: SelectOption[];
  passthroughWarning?: string | null;
  onFormatChange: (format: ExportFormat) => void;
  onEncoderChange: (encoder: VideoEncoder) => void;
  onSpeedChange: (speed: VideoSpeed) => void;
  onQualityChange: (quality: number) => void;
  onPassModeChange: (mode: PassMode) => void;
  onSizeCapChange: (value: string) => void;
  onCustomSizeCapValueChange: (value: string) => void;
  onCustomSizeCapCommit: (value: string) => void;
  onVideoModeChange: (mode: VideoMode) => void;
  onToggleAudio: () => void;
};

const ExportVideoSection = ({
  profile,
  formatOptions,
  encoderOptions,
  speedOptions,
  passModeOptions,
  qualityRange,
  qualityLabel,
  isVp9,
  sizeCapSelection,
  sizeCapSelectOptions,
  customSizeCapLabel,
  customSizeCapValue,
  customInputActive,
  videoMode,
  canUsePassthrough,
  videoModeOptions,
  passthroughWarning,
  onFormatChange,
  onEncoderChange,
  onSpeedChange,
  onQualityChange,
  onPassModeChange,
  onSizeCapChange,
  onCustomSizeCapValueChange,
  onCustomSizeCapCommit,
  onVideoModeChange,
  onToggleAudio
}: ExportVideoSectionProps) => (
  <div className="export-section export-section--wide">
    <div className="export-section-header">Format &amp; video</div>
    <div className="export-grid">
      <label className="export-field">
        <span className="export-label">Format</span>
        <Select
          className="export-input export-select"
          value={profile.format}
          options={formatOptions}
          onChange={(nextValue) => onFormatChange(nextValue as ExportFormat)}
        />
      </label>
      <label className="export-field">
        <span className="export-label">Encoder</span>
        <Select
          className="export-input export-select"
          value={profile.videoEncoder}
          options={encoderOptions}
          onChange={(nextValue) => onEncoderChange(nextValue as VideoEncoder)}
        />
      </label>
      <label className="export-field">
        <span className="export-label">Speed</span>
        <Select
          className="export-input export-select"
          value={profile.videoSpeed}
          options={speedOptions}
          onChange={(nextValue) => onSpeedChange(nextValue as VideoSpeed)}
        />
      </label>
      <label className="export-field">
        <span className="export-label">{qualityLabel}</span>
        <input
          className="export-input export-input--range range-input"
          type="range"
          min={qualityRange.min}
          max={qualityRange.max}
          step={qualityRange.step}
          value={profile.quality}
          onChange={(event) =>
            onQualityChange(Number.parseInt(event.target.value, 10))
          }
        />
        <p className="export-help">
          {qualityLabel} {profile.quality}
        </p>
      </label>
      <label className="export-field">
        <span className="export-label">Passes</span>
        <Select
          className="export-input export-select"
          value={isVp9 ? profile.passMode : "auto"}
          disabled={!isVp9}
          options={passModeOptions}
          onChange={(nextValue) => onPassModeChange(nextValue as PassMode)}
        />
        {!isVp9 && <p className="export-help">Pass selection is VP9-only.</p>}
      </label>
      <label className="export-field">
        <span className="export-label">Size (best-effort, KB)</span>
        <Select
          className="export-input export-select"
          value={sizeCapSelection}
          options={sizeCapSelectOptions}
          customInput={{
            valueKey: "custom",
            label: "Custom",
            displayLabel: customSizeCapLabel,
            value: customSizeCapValue,
            unit: "KB",
            placeholder: "Size in KB",
            onValueChange: onCustomSizeCapValueChange,
            onCommit: onCustomSizeCapCommit
          }}
          customInputActive={customInputActive}
          onChange={(nextValue) => onSizeCapChange(nextValue as string)}
        />
      </label>
      <label className="export-field">
        <span className="export-label">Video handling</span>
        <Select
          className="export-input export-select"
          value={videoMode}
          disabled={!canUsePassthrough}
          options={videoModeOptions}
          onChange={(nextValue) => onVideoModeChange(nextValue as VideoMode)}
        />
        {!canUsePassthrough && (
          <p className="export-help">
            Passthrough is only available for the Passthrough mode without trim.
          </p>
        )}
      </label>
      <label className="export-field export-field--toggle">
        <span className="export-label">Audio</span>
        <button
          className="export-toggle export-toggle--input"
          type="button"
          data-active={profile.audioEnabled}
          onClick={onToggleAudio}
        >
          {profile.audioEnabled ? "Audio on" : "Audio off"}
        </button>
      </label>
    </div>
    {passthroughWarning && <p className="export-warning">{passthroughWarning}</p>}
  </div>
);

export default ExportVideoSection;
