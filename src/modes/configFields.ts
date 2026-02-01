// Shared metadata describing how to edit mode configs in the mode browser.

export type ModeConfigFieldBase<TConfig extends Record<string, unknown>> = {
  key: keyof TConfig;
  label: string;
  description?: string;
};

export type ModeConfigField<TConfig extends Record<string, unknown>> =
  | (ModeConfigFieldBase<TConfig> & {
      kind: "range" | "number";
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      formatValue?: (value: number, config: TConfig) => string;
    })
  | (ModeConfigFieldBase<TConfig> & {
      kind: "select";
      options: Array<{ value: string; label: string }>;
    });
