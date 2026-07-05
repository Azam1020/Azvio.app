import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from './utils/storage';
import { darkColors, lightColors } from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

const MODE_KEY = 'azvio_theme_mode';

type ThemeState = {
  mode: ThemeMode;
  isDark: boolean;
  C: typeof lightColors;
  setMode: (m: ThemeMode) => void;
};

const ThemeCtx = createContext<ThemeState>({
  mode: 'system',
  isDark: false,
  C: lightColors,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    storage.getItem<ThemeMode>(MODE_KEY, 'system').then((v) => {
      if (v) setModeState(v);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.setItem(MODE_KEY, m);
  };

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const C = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  return <ThemeCtx.Provider value={{ mode, isDark, C, setMode }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
