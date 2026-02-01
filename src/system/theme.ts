// Theme utilities and metadata shared across the app.

export type AppTheme = "midnight" | "ember" | "violet" | "snow";

export type ThemeOption = {
  id: AppTheme;
  label: string;
  color: string;
  glow: string;
};

export const DEFAULT_THEME: AppTheme = "midnight";
const THEME_STORAGE_KEY = "bitrot.theme";

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "midnight",
    label: "Green",
    color: "#7bffa8",
    glow: "rgba(123, 255, 168, 0.45)"
  },
  {
    id: "ember",
    label: "Red",
    color: "#ff8476",
    glow: "rgba(255, 132, 118, 0.45)"
  },
  {
    id: "violet",
    label: "Blue",
    color: "#7bb7ff",
    glow: "rgba(123, 183, 255, 0.55)"
  },
  {
    id: "snow",
    label: "White",
    color: "#e6e2da",
    glow: "rgba(255, 255, 255, 0.85)"
  }
];

const isTheme = (value: string | null): value is AppTheme =>
  THEME_OPTIONS.some((option) => option.id === value);

const readStorage = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStorage = (theme: AppTheme) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Local storage can be disabled; fail silently.
  }
};

export const readStoredTheme = (): AppTheme => {
  const stored = readStorage();
  return isTheme(stored) ? stored : DEFAULT_THEME;
};

export const applyTheme = (theme: AppTheme) => {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = theme;
};

export const persistThemePreference = (theme: AppTheme) => {
  applyTheme(theme);
  writeStorage(theme);
};
