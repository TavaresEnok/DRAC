import { normalizeServerUrl } from './api';

/**
 * Acrescenta o token curto exigido pelo MediaMTX sem apagar query params já
 * emitidos pelo servidor. A origem continua sendo validada/normalizada pela API.
 */
export function authenticatedMediaUrl(
  raw: string | null | undefined,
  apiUrl: string,
  streamToken?: string | null,
): string | null {
  const normalized = normalizeServerUrl(raw, apiUrl);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (streamToken) url.searchParams.set('token', streamToken);
    return url.toString();
  } catch {
    return null;
  }
}

export function isSecureMediaUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
