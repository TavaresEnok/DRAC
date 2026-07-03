const DEFAULT_TIMEOUT_MS = 15_000;

// Handler global de "sessão expirada". O App registra sua função de logout aqui;
// qualquer requisição AUTENTICADA que receba 401 dispara o logout gracioso, em
// vez de deixar o app preso mostrando telas vazias com um token morto.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function request<T>(apiUrl: string, path: string, token?: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      // 401 numa requisição AUTENTICADA = token expirado/revogado → logout gracioso.
      // (No login não há token, então senha errada não dispara isto.)
      if (response.status === 401 && token) {
        unauthorizedHandler?.();
      }
      // Anexa o status HTTP ao erro para que quem chama possa tratar 401 (sessão
      // expirada) de forma robusta, sem depender do texto da mensagem.
      const error = new Error(data?.message ?? `HTTP ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tempo esgotado. Verifique a conexão.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeServerUrl(value: string | null | undefined, apiUrl: string) {
  if (!value) return null;
  const api = new URL(apiUrl);
  return value.replace(/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, `//${api.host}`);
}
