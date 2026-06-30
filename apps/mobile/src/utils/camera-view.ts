/**
 * Helpers de APRESENTAÇÃO de câmera para a UI do redesign. O tipo Camera de
 * produção não tem os campos visuais do mockup (area/resolution/tint); estes
 * helpers derivam rótulos e um gradiente placeholder determinístico a partir
 * dos dados reais, para os tiles ficarem variados quando não há poster ainda.
 */
import type { Camera } from '../types';

// Paleta de gradientes placeholder (mesma vibe do mockup).
const TINTS: Array<[string, string]> = [
  ['#1f2937', '#0f172a'],
  ['#2b2733', '#13111a'],
  ['#243044', '#101826'],
  ['#1e2b29', '#0c1413'],
  ['#26223a', '#120f1f'],
  ['#203a3a', '#0c1a1a'],
  ['#27313f', '#101722'],
  ['#2a2433', '#141019'],
];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Gradiente determinístico (estável por câmera) para o placeholder do tile. */
export function tintFor(camera: Pick<Camera, 'id'>): [string, string] {
  return TINTS[hash(camera.id) % TINTS.length];
}

/** Rótulo de área/grupo da câmera (nome do grupo do servidor ou travessão). */
export function areaLabel(camera: Pick<Camera, 'group'>): string {
  return camera.group?.name ?? '—';
}

/** Resolução amigável a partir da altura detectada; vazio se desconhecida. */
export function resolutionLabel(camera: Pick<Camera, 'detectedWidth' | 'detectedHeight'>): string {
  const h = camera.detectedHeight ?? 0;
  if (h >= 2160) return '4K';
  if (h >= 1080) return '1080p';
  if (h >= 720) return '720p';
  if (h >= 480) return '480p';
  if (camera.detectedWidth && camera.detectedHeight) return `${camera.detectedWidth}×${camera.detectedHeight}`;
  return '';
}

export function isOnlineStatus(status: string | undefined): boolean {
  return (status ?? '').toUpperCase() === 'ONLINE';
}

/** Sem sinal: a câmera está cadastrada mas sem fluxo de vídeo. */
export function isNoSignalStatus(status: string | undefined): boolean {
  const s = (status ?? '').toUpperCase();
  return s === 'NOSIGNAL' || s === 'NO_SIGNAL' || s === 'UNKNOWN';
}
