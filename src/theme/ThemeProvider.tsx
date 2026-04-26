import { useEffect, useMemo, useState } from "react";
import {
  defaultThemeName,
  themes,
  type ThemeName,
} from "./themes";
import { ThemeContext, type ThemeContextValue } from "./ThemeContext";

const THEME_STORAGE_KEY = "archeryclubpoc-theme";

function resolveThemeName(value: string | null | undefined): ThemeName {
  if (value && value in themes) {
    return value as ThemeName;
  }

  return defaultThemeName;
}

export function ThemeProvider({
  children,
  themeName = defaultThemeName,
}: {
  children: React.ReactNode;
  themeName?: ThemeName;
}) {
  const [activeThemeName, setActiveThemeName] = useState<ThemeName>(() => {
    if (typeof window === "undefined") {
      return themeName;
    }

    return resolveThemeName(window.localStorage.getItem(THEME_STORAGE_KEY) ?? themeName);
  });

  const activeTheme = themes[activeThemeName];

  useEffect(() => {
    const root = document.documentElement;

    root.setAttribute("data-theme", activeThemeName);
    root.style.colorScheme = activeTheme.colorScheme;

    Object.entries(activeTheme.variables).forEach(([token, value]) => {
      root.style.setProperty(token, value);
    });

    window.localStorage.setItem(THEME_STORAGE_KEY, activeThemeName);
  }, [activeTheme, activeThemeName]);

  const value = useMemo<ThemeContextValue>(() => {
    const themeNames = Object.keys(themes) as ThemeName[];
    const currentThemeIndex = themeNames.indexOf(activeThemeName);

    return {
      availableThemes: themes,
      theme: activeTheme,
      themeName: activeThemeName,
      setThemeName: (nextThemeName) => {
        setActiveThemeName(resolveThemeName(nextThemeName));
      },
      toggleTheme: () => {
        const nextThemeName = themeNames[(currentThemeIndex + 1) % themeNames.length];
        setActiveThemeName(nextThemeName);
      },
    };
  }, [activeTheme, activeThemeName]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
