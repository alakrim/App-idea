import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';

import { palette, type ThemeColors, type ThemeScheme } from './tokens';

export type ThemeMode = 'system' | 'dark' | 'light';

export interface Theme {
  /** What the user chose. */
  mode: ThemeMode;
  /** What is rendered. Dark is the default when the system reports nothing. */
  scheme: ThemeScheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

/** The system scheme as React Native reports it. Anything but 'light' renders dark. */
export type SystemScheme = ColorSchemeName | null | undefined;

export function resolveScheme(mode: ThemeMode, system: SystemScheme): ThemeScheme {
  if (mode === 'system') {
    return system === 'light' ? 'light' : 'dark';
  }
  return mode;
}

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Persistence is a later brief; for now the choice lives in context only. */
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = 'system' }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const scheme = resolveScheme(mode, systemScheme);

  const value = useMemo<Theme>(
    () => ({ mode, scheme, colors: palette[scheme], setMode }),
    [mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme() must be used inside <ThemeProvider>.');
  }
  return theme;
}
