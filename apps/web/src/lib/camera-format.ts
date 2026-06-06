/**
 * Utilitários compartilhados de formatação/normalização de câmera.
 * Centraliza o que antes estava duplicado entre CamerasPage e CameraDetailPage.
 */

export type VideoCodec = 'original' | 'h264' | 'h265' | 'mjpeg';
export type RecordingMode = 'continuous' | 'motion' | 'schedule' | 'manual';
export type PreferredLiveProtocol = 'hls' | 'llhls' | 'webrtc' | 'mjpeg';

export const RECORDING_MODE_COPY: Record<RecordingMode, { label: string; detail: string; className: string }> = {
  manual: {
    label: 'Manual',
    detail: 'Só grava quando o operador liga.',
    className: 'border-slate-500/35 bg-slate-500/10 text-slate-300',
  },
  motion: {
    label: 'Movimento',
    detail: 'Armada: grava quando detectar movimento e para após o período sem movimento.',
    className: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  },
  continuous: {
    label: 'Contínua',
    detail: 'Intenção 24h: o sistema tenta manter gravando.',
    className: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
  },
  schedule: {
    label: 'Agenda',
    detail: 'Segue janela de agenda configurada.',
    className: 'border-indigo-500/35 bg-indigo-500/10 text-indigo-300',
  },
};

export function getRecordingModeCopy(mode?: RecordingMode | null) {
  return RECORDING_MODE_COPY[mode ?? 'manual'] ?? RECORDING_MODE_COPY.manual;
}

export function normalizeVideoCodec(codec?: string | null): VideoCodec {
  const value = codec?.trim().toLowerCase();
  if (!value || value === 'original' || value === 'source' || value === 'passthrough' || value === 'pass-through') {
    return 'original';
  }
  if (value === 'hevc' || value === 'h.265' || value === 'h265') return 'h265';
  if (value === 'mjpeg' || value === 'mjpg' || value === 'jpeg') return 'mjpeg';
  return 'h264';
}

export function normalizePreferredLiveProtocol(protocol?: string | null): PreferredLiveProtocol {
  const value = String(protocol ?? '').trim().toLowerCase();
  if (value === 'webrtc' || value === 'hls' || value === 'llhls' || value === 'll-hls' || value === 'mjpeg') {
    return value === 'll-hls' ? 'llhls' : value;
  }
  return 'webrtc';
}
