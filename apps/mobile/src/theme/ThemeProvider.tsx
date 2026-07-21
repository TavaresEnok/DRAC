/**
 * ThemeProvider — disponibiliza as paletas clara/escura da instalação e mantém
 * a preferência escolhida pelo usuário neste aparelho.
 *
 * Uso:
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 *   const { theme, branding, applyBranding } = useTheme();
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { type Theme, darkTheme, lightTheme, themeFor } from './theme';
import { isRedesign } from './redesign';
import { loadAppAccent, saveAppAccent } from './appPersonalization';
import { EMPTY_BRANDING, type BrandingPalette, type RuntimeBranding, darkenHex, ensureReadableText, isValidHex, shiftHex, withAlpha } from '../services/branding';

export type ThemeMode = 'dark' | 'light' | 'system';
const THEME_MODE_KEY = '@drac:theme-mode:v1';

interface ThemeContextValue {
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** Marca em runtime (logo/nome/cores) lida do servidor. */
  branding: RuntimeBranding;
  /** Aplica a marca recebida do servidor (cores entram no tema na hora). */
  applyBranding: (branding: RuntimeBranding) => void;
  /** Accent personalizado do app (redesign). null = padrão do mockup. */
  appAccent: string | null;
  /** Personaliza o accent do app; null volta ao padrão do mockup. */
  setAppAccent: (color: string | null) => void;
}

/** Aplica um accent personalizado por cima da paleta base (só troca o destaque). */
function withAppAccent(base: Theme, accent: string | null): Theme {
  if (!accent || !isValidHex(accent)) return base;
  const isDark = base.mode === 'dark';
  return {
    ...base,
    accent,
    accentDark: darkenHex(accent) ?? accent,
    accentBg: withAlpha(accent, isDark ? 0.16 : 0.1) ?? base.accentBg,
  };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Aplica as cores da marca por cima do tema base (controle POR SUPERFÍCIE —
 * cada área tem fundo + texto próprios). Campos vazios/inválidos caem no tema.
 *   primaryColor       → accent (destaques: botões, links, ícones ativos)
 *   buttonTextColor    → textOnAccent (texto SOBRE botões de destaque)
 *   backgroundColor    → bg (fundo das telas)
 *   backgroundTextColor→ bgText (texto fora de cards)
 *   secondaryColor     → surface (card/bloco) + surfaceAlt derivado + menu (segue o card)
 *   primaryTextColor   → text (texto do card)
 *   secondaryTextColor → textSub (subtexto do card) + textMuted derivado
 *   menuColor          → menu (fundo do menu inferior, sobrepõe o card)
 *   menuTextColor      → menuText (item inativo do menu)
 *   borderColor        → border
 *   success/warning/dangerColor → cores de status
 */
function withBranding(base: Theme, branding: BrandingPalette): Theme {
  let theme = base;
  if (isValidHex(branding.backgroundColor)) {
    // bg2 segue bg por padrão (fundo sólido); a 2ª cor abaixo transforma em gradiente.
    theme = { ...theme, bg: branding.backgroundColor, bg2: branding.backgroundColor };
  }
  if (isValidHex(branding.backgroundColor2)) {
    theme = { ...theme, bg2: branding.backgroundColor2 };
  }
  const isDark = base.mode === 'dark';
  if (isValidHex(branding.primaryColor)) {
    theme = {
      ...theme,
      accent: branding.primaryColor,
      accentDark: darkenHex(branding.primaryColor) ?? branding.primaryColor,
      accentBg: withAlpha(branding.primaryColor, isDark ? 0.16 : 0.1) ?? theme.accentBg,
    };
  }
  if (isValidHex(branding.buttonTextColor)) {
    theme = { ...theme, textOnAccent: branding.buttonTextColor };
  }
  if (isValidHex(branding.backgroundTextColor)) {
    theme = { ...theme, bgText: branding.backgroundTextColor };
  }
  if (isValidHex(branding.secondaryColor)) {
    const sec = branding.secondaryColor;
    theme = {
      ...theme,
      surface: sec,
      // Superfície alternativa (trilhos/segmentos): clareia no escuro, escurece no claro.
      surfaceAlt: shiftHex(sec, isDark ? 0.06 : -0.04) ?? theme.surfaceAlt,
      // O menu segue o card por padrão (menuColor sobrescreve abaixo).
      menu: sec,
      // Borda derivada do card, sutil (borderColor sobrescreve abaixo).
      border: withAlpha(isDark ? '#ffffff' : '#0f172a', isDark ? 0.08 : 0.09) ?? theme.border,
    };
  }
  if (isValidHex(branding.primaryTextColor)) {
    theme = { ...theme, text: branding.primaryTextColor };
  }
  if (isValidHex(branding.secondaryTextColor)) {
    theme = {
      ...theme,
      textSub: branding.secondaryTextColor,
      // Texto "muted" (mais apagado) derivado do secundário, puxando p/ o fundo.
      textMuted: shiftHex(branding.secondaryTextColor, isDark ? -0.18 : 0.18) ?? theme.textMuted,
    };
  }
  if (isValidHex(branding.menuColor)) {
    theme = { ...theme, menu: branding.menuColor };
  }
  if (isValidHex(branding.menuTextColor)) {
    theme = { ...theme, menuText: branding.menuTextColor };
  }
  if (isValidHex(branding.borderColor)) {
    theme = { ...theme, border: branding.borderColor };
  }
  if (isValidHex(branding.successColor)) {
    theme = { ...theme, success: branding.successColor };
  }
  if (isValidHex(branding.warningColor)) {
    theme = { ...theme, warning: branding.warningColor };
  }
  if (isValidHex(branding.dangerColor)) {
    theme = {
      ...theme,
      danger: branding.dangerColor,
      dangerBg: withAlpha(branding.dangerColor, isDark ? 0.12 : 0.08) ?? theme.dangerBg,
    };
  }
  // Segurança: se o texto do card foi trocado mas o texto do fundo NÃO, o texto
  // do fundo segue o do card — evita cabeçalho invisível (ex.: card→branco sem
  // ajustar o fundo deixaria o título com a cor padrão, sumindo em fundo claro).
  if (isValidHex(branding.primaryTextColor) && !isValidHex(branding.backgroundTextColor)) {
    theme = { ...theme, bgText: branding.primaryTextColor };
  }
  // White-label não pode produzir texto invisível. Mantém as cores do cliente
  // quando passam em contraste AA; caso contrário escolhe preto/branco.
  theme = {
    ...theme,
    text: ensureReadableText(theme.text, [theme.surface]),
    textSub: ensureReadableText(theme.textSub, [theme.surface]),
    bgText: ensureReadableText(theme.bgText, [theme.bg, theme.bg2]),
    menuText: ensureReadableText(theme.menuText, [theme.menu]),
    textOnAccent: ensureReadableText(theme.textOnAccent, [theme.accent, theme.accentDark]),
  };
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<RuntimeBranding>(EMPTY_BRANDING);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [appAccent, setAppAccentState] = useState<string | null>(null);
  const systemScheme = useColorScheme();

  useEffect(() => {
    void AsyncStorage.getItem(THEME_MODE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light' || stored === 'system') setThemeModeState(stored);
    }).catch(() => undefined);
    if (isRedesign) void loadAppAccent().then((c) => setAppAccentState(c)).catch(() => undefined);
  }, []);

  const setAppAccent = useCallback((color: string | null) => {
    setAppAccentState(color);
    void saveAppAccent(color);
  }, []);

  const applyBranding = useCallback((next: RuntimeBranding) => {
    setBranding(next);
  }, []);
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    void AsyncStorage.setItem(THEME_MODE_KEY, mode);
  }, []);

  const resolvedMode: 'dark' | 'light' = themeMode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : themeMode;
  const resolvedTheme = branding.useDefaultColors
    ? themeFor(resolvedMode)
    : withBranding(themeFor(resolvedMode), branding[resolvedMode]);
  const value = useMemo<ThemeContextValue>(
    () => ({
      // O toggle da Central decide entre a paleta original do app e a
      // personalização da instalação. O accent local, quando existir no
      // redesign, só complementa o modo personalizado.
      theme: isRedesign && !branding.useDefaultColors
        ? withAppAccent(resolvedTheme, appAccent)
        : resolvedTheme,
      themeMode,
      setThemeMode,
      branding,
      applyBranding,
      appAccent,
      setAppAccent,
    }),
    [themeMode, resolvedTheme, setThemeMode, branding, applyBranding, appAccent, setAppAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
