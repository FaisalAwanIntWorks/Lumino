import { createContext, useContext, ReactNode } from 'react';
import { THEME_COLOR_DEFAULTS, type ThemeColorSet } from '@/lib/theme-color-defaults';

export type WidgetTheme = 'luxury' | 'modern' | 'chat' | 'elegant' | 'twentyfourk';

interface WidgetThemeContextValue {
  theme: WidgetTheme;
  /**
   * Per-client CSS custom-property overrides (e.g. `--background`, `--cta-bg`)
   * derived from branding_config.themeColors. Portaled UI (dialogs) lives
   * outside the `[data-theme]` root, so it re-applies these inline to match
   * the widget's customized palette.
   */
  styleOverrides: Record<string, string>;
  /**
   * Resolved hex palette for the active theme (theme defaults merged with the
   * client's branding_config.themeColors). For consumers that need real hex
   * values (third-party embeds, alpha-blended inline styles).
   */
  colors: ThemeColorSet;
}

const WidgetThemeContext = createContext<WidgetThemeContextValue>({
  theme: 'luxury',
  styleOverrides: {},
  colors: THEME_COLOR_DEFAULTS.luxury,
});

export const useWidgetTheme = () => useContext(WidgetThemeContext);

interface WidgetThemeProviderProps {
  theme: WidgetTheme;
  styleOverrides?: Record<string, string>;
  colors?: ThemeColorSet;
  children: ReactNode;
}

export const WidgetThemeProvider = ({ theme, styleOverrides = {}, colors, children }: WidgetThemeProviderProps) => {
  const resolvedColors = colors || THEME_COLOR_DEFAULTS[theme] || THEME_COLOR_DEFAULTS.luxury;
  return (
    <WidgetThemeContext.Provider value={{ theme, styleOverrides, colors: resolvedColors }}>
      {children}
    </WidgetThemeContext.Provider>
  );
};
