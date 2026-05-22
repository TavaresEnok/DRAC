import type { Camera } from '../types';

export function formatTime(value?: string | null) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return 'em andamento';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}m ${rest}s`;
}

export function formatBytes(value?: string | number | null) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '--';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatResolution(camera?: Camera | null) {
  if (!camera?.detectedWidth || !camera.detectedHeight) return 'Resolução pendente';
  const fps = camera.detectedFps ? ` @ ${camera.detectedFps} FPS` : '';
  return `${camera.detectedWidth}x${camera.detectedHeight}${fps}`;
}

export function isOnline(camera: Camera) {
  return camera.status?.toUpperCase() === 'ONLINE';
}
