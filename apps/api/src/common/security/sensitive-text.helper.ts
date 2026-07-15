const URL_WITH_CREDENTIALS = /\b((?:rtsp|rtsps|http|https):\/\/)([^\s/@:]+):([^\s/@]+)@/gi;
const AUTHORITY_WITH_REDACTED_CREDENTIALS = /\b((?:rtsp|rtsps|http|https):\/\/)(?:\*{3}|<redacted>):(?:\*{3}|<redacted>)@/gi;

/**
 * Remove credenciais embutidas em URLs antes de enviar texto para logs,
 * diagnósticos ou respostas da API. O helper aceita mensagens completas do
 * FFmpeg/ffprobe e substitui todas as URLs encontradas, não apenas a primeira.
 */
export function sanitizeSensitiveText(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? '');
  return text
    .replace(URL_WITH_CREDENTIALS, '$1<redacted>@')
    .replace(AUTHORITY_WITH_REDACTED_CREDENTIALS, '$1<redacted>@');
}

export function containsCredentialBearingUrl(value: unknown): boolean {
  URL_WITH_CREDENTIALS.lastIndex = 0;
  const found = URL_WITH_CREDENTIALS.test(String(value ?? ''));
  URL_WITH_CREDENTIALS.lastIndex = 0;
  return found;
}
