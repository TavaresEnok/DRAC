/**
 * DRAC Mobile — temas base claro e escuro.
 * O branding do servidor sobrepõe cada paleta separadamente.
 * Os screens consomem o tema via useTheme() (ver ThemeProvider.tsx).
 */

export interface Theme {
  mode: 'dark' | 'light';

  // Backgrounds
  bg: string;          // fundo da tela
  bg2: string;         // 2ª cor do fundo — se != bg, o fundo vira gradiente
  bgText: string;      // texto sobre o fundo da tela (cabeçalhos fora de cards)
  surface: string;     // cards / painéis / inputs
  surfaceAlt: string;  // superfície alternativa (trilhos, segmentos)

  // Menu inferior (barra de abas) — separável do card
  menu: string;        // fundo da barra de menu
  menuText: string;    // ícone/rótulo de item inativo

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
  bg2: '#0b0d12',
  bgText: '#f4f6fa',
  surface: '#15181f',
  surfaceAlt: '#1b1f28',
  menu: '#15181f',
  menuText: '#6b7484',
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
  bg: '#f5f7fb',
  bg2: '#ffffff',
  bgText: '#111827',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  menu: '#ffffff',
  menuText: '#64748b',
  border: '#94a3b8',
  accent: '#2563eb',
  accentDark: '#1d4ed8',
  accentBg: 'rgba(37,99,235,0.10)',
  success: '#15803d',
  danger: '#dc2626',
  dangerBg: 'rgba(220,38,38,0.08)',
  warning: '#b45309',
  text: '#111827',
  textSub: '#4b5563',
  textMuted: '#64748b',
  textOnAccent: '#ffffff',
  videoBg: '#070809',
  tlBlue: '#2563eb',
  tlOrange: '#ea580c',
  tlHead: '#dc2626',
};

/** Compatibilidade para consumidores antigos que esperam um tema base. */
export const baseTheme: Theme = darkTheme;

/** Espaçamento e raios padronizados (8pt-ish). */
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const space = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 } as const;
