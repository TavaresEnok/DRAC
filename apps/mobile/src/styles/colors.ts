/**
 * DRAC Mobile – Design Tokens (Light Theme)
 * Fonte única da verdade para todas as cores do app.
 */
export const C = {
  // ── Backgrounds ─────────────────────────────────────────
  bg:         '#f3f4f6',   // tela / page background (gray-100)
  surface:    '#ffffff',   // cards, panels, inputs
  surfaceAlt: '#f9fafb',   // surface alternativa (gray-50)

  // ── Borders ─────────────────────────────────────────────
  border:      '#e5e7eb',  // gray-200
  borderFocus: '#dbeafe',  // azul claro para foco / card ativo

  // ── Accent (azul primário) ───────────────────────────────
  accent:      '#3b82f6',  // blue-500 — botões, chips ativos, links
  accentDark:  '#2563eb',  // blue-600 — hover / pressed
  accentBg:    '#eff6ff',  // blue-50  — fundo de chip ativo claro
  accentText:  '#1d4ed8',  // blue-700 — texto sobre accentBg

  // ── Semânticas ───────────────────────────────────────────
  success:       '#22c55e',            // câmera online (green-500)
  successText:   '#16a34a',
  danger:        '#ef4444',            // offline, erros, playhead (red-500)
  dangerBg:      'rgba(239,68,68,0.10)',
  dangerBorder:  'rgba(239,68,68,0.30)',
  dangerText:    '#be123c',            // texto vermelho legível em light
  warning:       '#fb923c',            // segmento de evento (orange-400)

  // ── Texto ────────────────────────────────────────────────
  text:        '#111827',  // gray-900 — texto principal
  textSub:     '#6b7280',  // gray-500 — texto secundário
  textMuted:   '#9ca3af',  // gray-400 — placeholder, hint
  textOnAccent:'#ffffff',  // texto sobre fundo de acento

  // ── Vídeo (sempre escuro, independente do tema) ───────────
  videoBg:       '#111827',
  videoOverlay:  'rgba(0,0,0,0.64)',
  videoOverlayMid: 'rgba(0,0,0,0.40)',

  // ── Timeline de gravações ────────────────────────────────
  tlBlue:   '#60a5fa',  // blue-400  — segmento gravado
  tlOrange: '#fb923c',  // orange-400 — segmento com evento
  tlBg:     '#e5e7eb',  // trilho vazio
  tlHead:   '#ef4444',  // playhead (linha vermelha)
} as const;
