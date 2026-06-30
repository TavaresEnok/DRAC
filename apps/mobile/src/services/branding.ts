/**
 * Branding em runtime — busca a identidade visual configurada no servidor
 * (Configurações → Aparência do web) e permite aplicá-la no app.
 *
 * Diferente do branding de build-time (src/branding.ts, embutido no APK), este
 * é lido do endpoint público `GET /settings/branding` da própria instalação, de
 * forma que o que o admin salvar nas Configurações reflita também no app.
 */
import { request } from './api';

export interface RuntimeBranding {
  facilityName: string;
  logoDataUrl: string;
  primaryColor: string;
  backgroundColor: string;
}

type BrandingResponse = {
  facilityName?: string;
  brandLogoDataUrl?: string;
  brandPrimaryColor?: string;
  brandBackgroundColor?: string;
};

export const EMPTY_BRANDING: RuntimeBranding = {
  facilityName: '',
  logoDataUrl: '',
  primaryColor: '',
  backgroundColor: '',
};

export async function fetchBranding(apiUrl: string): Promise<RuntimeBranding> {
  if (!apiUrl) return EMPTY_BRANDING;
  const data = await request<BrandingResponse>(apiUrl, '/settings/branding');
  return {
    facilityName: (data.facilityName ?? '').trim(),
    logoDataUrl: (data.brandLogoDataUrl ?? '').trim(),
    primaryColor: (data.brandPrimaryColor ?? '').trim(),
    backgroundColor: (data.brandBackgroundColor ?? '').trim(),
  };
}

const HEX = /^#?([0-9a-fA-F]{6})$/;

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** Escurece um hex por um fator (0..1). Usado para o tom "accentDark" do botão. */
export function darkenHex(hex: string, amount = 0.16): string | null {
  const c = parseHex(hex);
  if (!c) return null;
  const f = 1 - amount;
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n * f))).toString(16).padStart(2, '0');
  return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
}

/** Versão com transparência (rgba) — usada para fundos suaves de chips/ícones. */
export function withAlpha(hex: string, alpha: number): string | null {
  const c = parseHex(hex);
  if (!c) return null;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

export function isValidHex(hex: string): boolean {
  return HEX.test(hex.trim());
}
