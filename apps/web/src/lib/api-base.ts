function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    if (envUrl && envUrl.trim()) {
      try {
        const parsed = new URL(envUrl);
        if (!(isLocalHost(parsed.hostname) && !isLocalHost(hostname))) {
          return trimTrailingSlash(envUrl);
        }
      } catch {
        return trimTrailingSlash(envUrl);
      }
    }

    if (!isLocalHost(hostname)) {
      return '/api';
    }

    return `${protocol}//${hostname}:3000`;
  }

  if (envUrl && envUrl.trim()) {
    return trimTrailingSlash(envUrl);
  }

  const loopbackHost = ['127', '0', '0', '1'].join('.');
  return `http://${loopbackHost}:3000`;
}
