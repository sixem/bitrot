import type { ModeConfigField } from "@/modes/configFields";
import Select from "@/ui/controls/Select";

type ModeConfigEditorProps<TConfig extends Record<string, unknown>> = {
  config: TConfig;
  fields: ModeConfigField<TConfig>[];
  onChange: (patch: Partial<TConfig>) => void;
  disabled?: boolean;
};

const formatNumericValue = <TConfig extends Record<string, unknown>,>(
  field: Extract<ModeConfigField<TConfig>, { kind: "range" | "number" }>,
  value: number,
  config: TConfig
) => {
  if (field.formatValue) {
    return field.formatValue(value, config);
  }
  if (field.unit) {
    return `${value}${field.unit}`;
  }
  return String(value);
};

// Generic config editor for the mode browser detail panel.
const ModeConfigEditor = <TConfig extends Record<string, unknown>,>({
  config,
  fields,
  onChange,
  disabled
}: ModeConfigEditorProps<TConfig>) => (
  <div className="mode-config-editor">
    {fields.map((field) => {
      const fieldKey = String(field.key);
      const rawValue = config[field.key];

      if (field.kind === "select") {
        const selectedValue =
          typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
        return (
          <div key={fieldKey} className="mode-config-field">
            <div className="mode-config-field__row">
              <span className="mode-config-field__label">{field.label}</span>
              <Select
                className="editor-select"
                value={selectedValue}
                onChange={(nextValue) =>
                  onChange({ [field.key]: nextValue } as Partial<TConfig>)
                }
                ariaLabel={field.label}
                disabled={disabled}
                options={field.options}
              />
            </div>
            {field.description ? (
              <p className="mode-config-field__description">{field.description}</p>
            ) : null}
          </div>
        );
      }

      const numericValue =
        typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
      const showValue = field.kind === "range";

      return (
        <div key={fieldKey} className="mode-config-field">
          <div
            className="mode-config-field__row"
            data-has-value={showValue}
          >
            <span className="mode-config-field__label">{field.label}</span>
            <input
              className={field.kind === "range" ? "mode-slider" : "mode-input"}
              type={field.kind}
              min={field.min}
              max={field.max}
              step={field.step}
              value={numericValue}
              onChange={(event) =>
                onChange({
                  [field.key]: Number(event.target.value)
                } as Partial<TConfig>)
              }
              aria-label={field.label}
              disabled={disabled}
            />
            {showValue ? (
              <span className="mode-config-field__value">
                {formatNumericValue(field, numericValue, config)}
              </span>
            ) : null}
          </div>
          {field.description ? (
            <p className="mode-config-field__description">{field.description}</p>
          ) : null}
        </div>
      );
    })}
  </div>
);

export default ModeConfigEditor;

