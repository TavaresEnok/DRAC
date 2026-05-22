import { formatBytes, formatDateLabel, formatDuration, formatResolution, formatTime, isOnline } from '../src/utils/format';
import { normalizeServerUrl, request } from '../src/services/api';
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