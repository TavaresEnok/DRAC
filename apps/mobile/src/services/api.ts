export async function request<T>(apiUrl: string, path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? `HTTP ${response.status}`);
  }
  return data as T;
}

export function normalizeServerUrl(value: string | null | undefined, apiUrl: string) {
  if (!value) return null;
  const api = new URL(apiUrl);
  return value.replace(/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, `//${api.host}`);
}
