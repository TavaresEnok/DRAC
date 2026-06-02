// Cache for stream URLs to prevent duplicate requests during grid view load
const streamUrlsCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 8000; // 8 second cache

export function clearStreamUrlsCache(cameraId?: string) {
  if (cameraId) {
    streamUrlsCache.delete(cameraId);
  } else {
    streamUrlsCache.clear();
  }
}

export async function requestCachedStreamUrls<T>(
  apiUrl: string,
  cameraId: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  // Check cache first
  const cached = streamUrlsCache.get(cameraId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data as T;
  }

  // Make actual request
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${apiUrl}/camera-stream/${cameraId}/urls`, {
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
      throw new Error(data?.message ?? `HTTP ${response.status}`);
    }

    // Cache the successful response
    streamUrlsCache.set(cameraId, {
      data: data as T,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

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
