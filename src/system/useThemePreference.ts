import { useCallback, useLayoutEffect, useState } from "react";
import {
  persistThemePreference,
  readStoredTheme,
  type AppTheme
} from "@/system/theme";

// Tracks the active theme and persists it for future sessions.
const useThemePreference = () => {
  const [theme, setTheme] = useState<AppTheme>(() => readStoredTheme());

  useLayoutEffect(() => {
    persistThemePreference(theme);
  }, [theme]);

  const updateTheme = useCallback((nextTheme: AppTheme) => {
    setTheme(nextTheme);
  }, []);

  return {
    theme,
    setTheme: updateTheme
  };
};

export default useThemePreference;
