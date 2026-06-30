/**
 * ThemeProvider — disponibiliza o tema atual, a troca claro/escuro e a marca
 * (branding) aplicada em runtime a partir do servidor.
 * A preferência de tema é persistida em AsyncStorage (chave @drac:theme).
 *
 * Uso:
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 *   const { theme, mode, setMode, toggle, branding, applyBranding } = useTheme();
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type Theme, type ThemeMode, themes } from './theme';
import { EMPTY_BRANDING, type RuntimeBranding, darkenHex, isValidHex, withAlpha } from '../services/branding';

const STORAGE_KEY = '@drac:theme';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  /** Marca em runtime (logo/nome/cores) lida do servidor. */
  branding: RuntimeBranding;
  /** Aplica a marca recebida do servidor (cores entram no tema na hora). */
  applyBranding: (branding: RuntimeBranding) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Aplica as cores da marca por cima do tema base (accent = cor principal; bg = fundo). */
function withBranding(base: Theme, branding: RuntimeBranding): Theme {
  let theme = base;
  if (isValidHex(branding.primaryColor)) {
    theme = {
      ...theme,
      accent: branding.primaryColor,
      accentDark: darkenHex(branding.primaryColor) ?? branding.primaryColor,
      accentBg: withAlpha(branding.primaryColor, theme.mode === 'dark' ? 0.16 : 0.1) ?? theme.accentBg,
    };
  }
  if (isValidHex(branding.backgroundColor)) {
    theme = { ...theme, bg: branding.backgroundColor };
  }
  return theme;
}

export function ThemeProvider({
  children,
  initialMode = 'dark',
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [branding, setBranding] = useState<RuntimeBranding>(EMPTY_BRANDING);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'dark' || value === 'light') setModeState(value);
      })
      .catch(() => undefined);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((current) => {
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const applyBranding = useCallback((next: RuntimeBranding) => {
    setBranding(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: withBranding(themes[mode], branding), mode, setMode, toggle, branding, applyBranding }),
    [mode, branding, setMode, toggle, applyBranding],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
