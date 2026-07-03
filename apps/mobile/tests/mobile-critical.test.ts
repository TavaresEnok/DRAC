import { formatBytes, formatDateLabel, formatDuration, formatResolution, formatTime, isOnline } from '../src/utils/format';
import { normalizeServerUrl, request, setUnauthorizedHandler } from '../src/services/api';
import { computeDetectionRect } from '../src/utils/detection-geometry';
import type { Camera } from '../src/types';

type TestCase = { name: string; fn: () => void | Promise<void> };
const tests: TestCase[] = [];

function test(name: string, fn: TestCase['fn']) {
  tests.push({ name, fn });
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

test('formatters: tempo, duração, bytes e resolução', () => {
  assert(formatTime(null) === '--:--', 'formatTime deve tratar valor vazio');
  assert(formatDuration(0) === 'em andamento', 'formatDuration deve tratar zero como em andamento');
  assert(formatDuration(90) === '1m 30s', 'formatDuration deve formatar minutos e segundos');
  assert(formatBytes(1024) === '1 KB', 'formatBytes deve formatar KB');
  assert(formatBytes(1024 * 1024) === '1.0 MB', 'formatBytes deve formatar MB');
  assert(formatResolution({ detectedWidth: 1920, detectedHeight: 1080, detectedFps: 30 } as Camera) === '1920x1080 @ 30 FPS', 'formatResolution deve incluir FPS');
});

test('formatDateLabel: hoje e data histórica', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert(formatDateLabel(today) === 'Hoje', 'data atual deve ser Hoje');
  assert(formatDateLabel('2026-05-20').includes('20'), 'data histórica deve conter dia');
});

test('isOnline: normaliza status da câmera', () => {
  assert(isOnline({ status: 'ONLINE' } as Camera), 'ONLINE deve estar online');
  assert(isOnline({ status: 'online' } as Camera), 'online deve estar online');
  assert(!isOnline({ status: 'OFFLINE' } as Camera), 'OFFLINE deve estar offline');
});

test('normalizeServerUrl: troca localhost pelo host da API', () => {
  const normalized = normalizeServerUrl('http://localhost:3002/camera-stream/1/poster', 'http://168.194.13.70:3002');
  assert(normalized === 'http://168.194.13.70:3002/camera-stream/1/poster', 'localhost deve ser substituído');
  assert(normalizeServerUrl(null, 'http://api.local') === null, 'null deve retornar null');
});

test('request: envia autorização e parseia JSON', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const data = await request<{ ok: boolean }>('http://api.local', '/ping', 'token-123');
  assert(data.ok === true, 'request deve retornar JSON');
  assert(calls[0]?.url === 'http://api.local/ping', 'request deve montar URL');
  assert((calls[0]?.init?.headers as Record<string, string>).Authorization === 'Bearer token-123', 'request deve enviar bearer token');
});

test('request: transforma AbortError em mensagem amigável', async () => {
  globalThis.fetch = (async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  }) as typeof fetch;

  let message = '';
  try {
    await request('http://api.local', '/slow');
  } catch (error) {
    message = error instanceof Error ? error.message : '';
  }
  assert(message === 'Tempo esgotado. Verifique a conexão.', 'AbortError deve virar timeout amigável');
});

test('computeDetectionRect: mapeia bbox respeitando o letterbox do contain', () => {
  // Frame 1000x1000 num container 200x100 → vídeo renderizado fica 100x100,
  // centralizado, com 50px de letterbox em cada lado horizontal.
  const rect = computeDetectionRect([0, 0, 500, 500], 1000, 1000, 200, 100);
  assert(Math.abs(rect.left - 50) < 0.001, `left deve considerar offset do letterbox (got ${rect.left})`);
  assert(Math.abs(rect.top - 0) < 0.001, `top deve ser 0 (got ${rect.top})`);
  assert(Math.abs(rect.width - 50) < 0.001, `width deve escalar pela menor dimensão (got ${rect.width})`);
  assert(Math.abs(rect.height - 50) < 0.001, `height deve escalar pela menor dimensão (got ${rect.height})`);

  // Caixa degenerada não deve sumir: largura/altura mínima de 2px.
  const tiny = computeDetectionRect([10, 10, 10, 10], 1000, 1000, 100, 100);
  assert(tiny.width >= 2 && tiny.height >= 2, 'caixa mínima deve ter ao menos 2px');
});

test('api 401: requisição AUTENTICADA dispara o handler de sessão expirada', async () => {
  const originalFetch = global.fetch;
  let fired = 0;
  setUnauthorizedHandler(() => { fired += 1; });
  global.fetch = (async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ message: 'expired' }),
  })) as unknown as typeof fetch;
  try {
    await request('http://x', '/cameras', 'a-token').catch(() => undefined);
    assert(fired === 1, `handler deveria disparar 1x em 401 autenticado (got ${fired})`);
  } finally {
    global.fetch = originalFetch;
    setUnauthorizedHandler(null);
  }
});

test('api 401: SEM token (login) NÃO dispara o handler', async () => {
  const originalFetch = global.fetch;
  let fired = 0;
  setUnauthorizedHandler(() => { fired += 1; });
  global.fetch = (async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ message: 'senha inválida' }),
  })) as unknown as typeof fetch;
  try {
    await request('http://x', '/auth/login').catch(() => undefined);
    assert(fired === 0, `handler NÃO deve disparar em 401 sem token (got ${fired})`);
  } finally {
    global.fetch = originalFetch;
    setUnauthorizedHandler(null);
  }
});

async function main() {
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`ok - ${item.name}`);
    } catch (error) {
      console.error(`not ok - ${item.name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  if (!process.exitCode) {
    console.log(`${tests.length} teste(s) mobile passaram.`);
  }
}

void main();