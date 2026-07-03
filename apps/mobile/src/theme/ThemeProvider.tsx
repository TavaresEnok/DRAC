/**
 * ThemeProvider — disponibiliza o tema (base escuro único) + a marca (branding)
 * aplicada em runtime a partir do servidor. O tema claro/escuro foi removido: a
 * aparência vem 100% do branding por cima do base.
 *
 * Uso:
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 *   const { theme, branding, applyBranding } = useTheme();
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { type Theme, baseTheme } from './theme';
import { EMPTY_BRANDING, type RuntimeBranding, darkenHex, isValidHex, shiftHex, withAlpha } from '../services/branding';

interface ThemeContextValue {
  theme: Theme;
  /** Marca em runtime (logo/nome/cores) lida do servidor. */
  branding: RuntimeBranding;
  /** Aplica a marca recebida do servidor (cores entram no tema na hora). */
  applyBranding: (branding: RuntimeBranding) => void;
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
function withBranding(base: Theme, branding: RuntimeBranding): Theme {
  let theme = base;
  const isDark = theme.mode === 'dark';
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
  if (isValidHex(branding.backgroundColor)) {
    // bg2 segue bg por padrão (fundo sólido); a 2ª cor abaixo transforma em gradiente.
    theme = { ...theme, bg: branding.backgroundColor, bg2: branding.backgroundColor };
  }
  if (isValidHex(branding.backgroundColor2)) {
    theme = { ...theme, bg2: branding.backgroundColor2 };
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
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<RuntimeBranding>(EMPTY_BRANDING);

  const applyBranding = useCallback((next: RuntimeBranding) => {
    setBranding(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: withBranding(baseTheme, branding), branding, applyBranding }),
    [branding, applyBranding],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
