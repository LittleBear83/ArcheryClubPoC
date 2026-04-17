import { createContext } from "react";
import {
  defaultThemeName,
  themes,
  type ThemeDefinition,
  type ThemeName,
} from "./themes";

export type ThemeContextValue = {
  availableThemes: typeof themes;
  theme: ThemeDefinition;
  themeName: ThemeName;
  setThemeName: (themeName: ThemeName) => void;
  toggleTheme: () => void;
};

const defaultTheme = themes[defaultThemeName];

export const ThemeContext = createContext<ThemeContextValue>({
  availableThemes: themes,
  theme: defaultTheme,
  themeName: defaultThemeName,
  setThemeName: () => undefined,
  toggleTheme: () => undefined,
});
