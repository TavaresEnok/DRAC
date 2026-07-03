// 'original' = "máxima qualidade": serve o stream PRINCIPAL da câmera em
// PASSTHROUGH (sem transcode, inclusive H.265) via HLS. Custo ~0 de CPU no
// servidor; o celular decodifica o HEVC no hardware. Latência maior que WebRTC.
export type LiveViewMode = 'selected' | 'grid' | 'original';

export const GRID_LIVE_MAX_WIDTH = 1280;
export const GRID_LIVE_MAX_HEIGHT = 720;
export const GRID_LIVE_TARGET_FPS = 20;

export function normalizeLiveViewMode(value?: string | null): LiveViewMode {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'grid') return 'grid';
  if (v === 'original') return 'original';
  return 'selected';
}

export function resolveGridLiveProfile(input?: {
  detectedWidth?: number | null;
  detectedHeight?: number | null;
  streamWidth?: number | null;
  streamHeight?: number | null;
}) {
  const widthCandidate = input?.detectedWidth ?? input?.streamWidth ?? GRID_LIVE_MAX_WIDTH;
  const heightCandidate = input?.detectedHeight ?? input?.streamHeight ?? GRID_LIVE_MAX_HEIGHT;

  return {
    width: Math.max(1, Math.min(GRID_LIVE_MAX_WIDTH, Number(widthCandidate) || GRID_LIVE_MAX_WIDTH)),
    height: Math.max(1, Math.min(GRID_LIVE_MAX_HEIGHT, Number(heightCandidate) || GRID_LIVE_MAX_HEIGHT)),
    fps: GRID_LIVE_TARGET_FPS,
  };
}
