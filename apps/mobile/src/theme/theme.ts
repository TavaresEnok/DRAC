/**
 * DRAC Mobile — Sistema de temas (claro/escuro)
 * Fonte única da verdade para cores. Derivado de apps/mobile/src/styles/colors.ts.
 * Os screens consomem o tema via useTheme() (ver ThemeProvider.tsx).
 */

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;

  // Backgrounds
  bg: string;          // fundo da tela
  surface: string;     // cards / painéis / inputs
  surfaceAlt: string;  // superfície alternativa (trilhos, segmentos)

  // Borders
  border: string;

  // Accent
  accent: string;
  accentDark: string;
  accentBg: string;    // fundo suave do accent (chips/ícones)

  // Semânticas
  success: string;
  danger: string;
  dangerBg: string;
  warning: string;

  // Texto
  text: string;
  textSub: string;
  textMuted: string;
  textOnAccent: string;

  // Vídeo (sempre escuro, independe do tema)
  videoBg: string;

  // Timeline de gravações
  tlBlue: string;
  tlOrange: string;
  tlHead: string;
}

export const darkTheme: Theme = {
  mode: 'dark',
  bg: '#0b0d12',
  surface: '#15181f',
  surfaceAlt: '#1b1f28',
  border: 'rgba(255,255,255,0.08)',
  accent: '#3b82f6',
  accentDark: '#2563eb',
  accentBg: 'rgba(59,130,246,0.16)',
  success: '#22c55e',
  danger: '#ef4444',
  dangerBg: 'rgba(239,68,68,0.12)',
  warning: '#f59e0b',
  text: '#f4f6fa',
  textSub: '#9aa3af',
  textMuted: '#6b7484',
  textOnAccent: '#ffffff',
  videoBg: '#070809',
  tlBlue: '#60a5fa',
  tlOrange: '#fb923c',
  tlHead: '#ef4444',
};

export const lightTheme: Theme = {
  mode: 'light',
  bg: '#eef0f4',
  surface: '#ffffff',
  surfaceAlt: '#f5f6f9',
  border: 'rgba(15,23,42,0.09)',
  accent: '#3b82f6',
  accentDark: '#2563eb',
  accentBg: 'rgba(59,130,246,0.10)',
  success: '#16a34a',
  danger: '#ef4444',
  dangerBg: 'rgba(239,68,68,0.08)',
  warning: '#d97706',
  text: '#0d1117',
  textSub: '#5b6573',
  textMuted: '#9aa3af',
  textOnAccent: '#ffffff',
  videoBg: '#070809',
  tlBlue: '#3b82f6',
  tlOrange: '#f59e0b',
  tlHead: '#ef4444',
};

export const themes: Record<ThemeMode, Theme> = {
  dark: darkTheme,
  light: lightTheme,
};

/** Espaçamento e raios padronizados (8pt-ish). */
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const space = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 } as const;
