import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutGrid, List, Search, Filter, Plus, Edit, PlaySquare,
  Crosshair, RefreshCw, ChevronRight, X, Wifi, HardDrive,
  Camera as CameraIcon, Check, Trash2, Circle, Radar
} from 'lucide-react';
import { format } from 'date-fns';
import { Camera, useVmsDataStore } from '../store/vmsDataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocation } from 'wouter';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
const STATUSES = ['all', 'online', 'recording', 'motion', 'alarm', 'offline', 'no_signal', 'maintenance'] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  all: 'Todos os status',
  online: 'Online',
  recording: 'Gravando',
  motion: 'Movimento',
  alarm: 'Alarme',
  offline: 'Offline',
  no_signal: 'Sem sinal',
  maintenance: 'Manutenção',
};

const STATUS_BADGE: Record<string, string> = {
  online: 'bg-[hsl(150,65%,42%_/_0.12)] text-[hsl(150,65%,42%)] border-[hsl(150,65%,42%_/_0.3)]',
  recording: 'bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.3)]',
  motion: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]',
  alarm: 'bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.3)]',
  offline: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
  no_signal: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border',
  maintenance: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]',
};

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join('\n');
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof error.response?.data?.error === 'string') return error.response.data.error;
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

type VideoCodec = 'original' | 'h264' | 'h265' | 'mjpeg';
type RecordingMode = Camera['recordingMode'];
type PreferredLiveProtocol = 'auto' | 'hls' | 'llhls' | 'webrtc' | 'mjpeg';

const DEFAULT_CAMERA_CHANNEL = 1;
const MAIN_STREAM_SUBTYPE = 0;
const ANALYTICS_STREAM_SUBTYPE = 1;

const RECORDING_MODE_COPY: Record<RecordingMode, { label: string; detail: string; className: string }> = {
  manual: {
    label: 'Manual',
    detail: 'Só grava quando o operador liga.',
    className: 'border-slate-500/35 bg-slate-500/10 text-slate-300',
  },
  motion: {
    label: 'Movimento',
    detail: 'Armada: grava quando detectar movimento.',
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

function getRecordingModeCopy(mode?: RecordingMode | null) {
  return RECORDING_MODE_COPY[mode ?? 'manual'] ?? RECORDING_MODE_COPY.manual;
}

function normalizeVideoCodec(codec?: string | null): VideoCodec {
  const value = codec?.trim().toLowerCase();
  if (!value || value === 'original' || value === 'source' || value === 'passthrough' || value === 'pass-through') return 'original';
  if (value === 'hevc' || value === 'h.265' || value === 'h265') return 'h265';
  if (value === 'mjpeg' || value === 'mjpg' || value === 'jpeg') return 'mjpeg';
  return 'h264';
}

function formatLiveProtocol(protocol?: string | null) {
  switch (String(protocol ?? '').toLowerCase()) {
    case 'auto':
      return 'Padrão (WebRTC -> LL-HLS -> HLS)';
    case 'webrtc':
      return 'WebRTC';
    case 'hls':
      return 'HLS';
    case 'llhls':
    case 'll-hls':
      return 'LL-HLS';
    case 'mjpeg':
      return 'MJPEG';
    default:
      return 'Padrão (WebRTC -> LL-HLS -> HLS)';
  }
}

function normalizePreferredLiveProtocol(protocol?: string | null): PreferredLiveProtocol {
  const value = String(protocol ?? '').trim().toLowerCase();
  if (value === 'webrtc' || value === 'hls' || value === 'llhls' || value === 'll-hls' || value === 'mjpeg') {
    return value === 'll-hls' ? 'llhls' : value;
  }
  return 'auto';
}

function WizardModal({
  onClose,
  zones,
  onCreated,
  onTestConnection,
}: {
  onClose: () => void;
  zones: string[];
  onCreated: (payload: {
    name: string;
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username: string;
    password: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
    liveChannel?: number;
    liveSubtype?: number;
    recordingChannel?: number;
    recordingSubtype?: number;
    analyticsChannel?: number;
    analyticsSubtype?: number;
    recordingEnabled: boolean;
    recordingMode: 'continuous' | 'motion' | 'schedule' | 'manual';
    retentionDays: number;
    preferredRtspTransport: 'tcp' | 'udp';
    preferredLiveProtocol: PreferredLiveProtocol;
    streamVideoCodec: VideoCodec;
    streamWidth?: number;
    streamHeight?: number;
    streamFps?: number;
    streamBitrateKbps?: number;
    recordingVideoCodec: VideoCodec;
    recordingWidth?: number;
    recordingHeight?: number;
    recordingFps?: number;
    recordingBitrateKbps?: number;
    audioEnabled: boolean;
  }) => Promise<void>;
  onTestConnection: (payload: {
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username?: string;
    password?: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
  }) => Promise<{
    rtspReachable: boolean;
    rtspReachableAny?: boolean;
    reachableRtspPorts?: number[];
    onvifReachable: boolean;
    ptzDigestOk?: boolean;
    reachableOnvifPorts?: number[];
    rtspAuthOk?: boolean;
    selectedRtspPortAuthOk?: boolean;
    detectedRtspPort?: number | null;
    detectedRtspPath?: string | null;
    suggestedRtspPath?: string;
    detectedOnvifPort?: number | null;
    detectedOnvifPath?: string | null;
    detectedOnvifProfileToken?: string | null;
    rtspProbeError?: string | null;
    status: string;
    detectedStream?: {
      codec?: string | null;
      width?: number | null;
      height?: number | null;
      fps?: number | null;
      bitrateKbps?: number | null;
    } | null;
  }>;
}) {
  const [step, setStep] = useState(0);
  const [detectedMax, setDetectedMax] = useState<{
    width: number | null;
    height: number | null;
    fps: number | null;
    bitrateKbps: number | null;
  } | null>(null);
  const steps = ['Conexão', 'Identidade', 'Gravação', 'Confirmar'];
  const validZones = zones.filter((zone) => zone !== 'all');
  const [form, setForm] = useState({
    ip: '',
    port: '554',
    onvifPort: '8075',
    protocol: 'rtsp',
    username: '',
    password: '',
    rtspPath: '',
    onvifPath: '/onvif/ptz_service',
    onvifProfileToken: 'Profile000',
    channel: '1',
    subtype: '0',
    name: '',
    zone: validZones[0] ?? '',
    building: validZones[0] ?? '',
    recordingMode: 'continuous',
    retentionDays: '90',
    preferredRtspTransport: 'tcp',
    preferredLiveProtocol: 'auto',
    streamVideoCodec: 'original',
    streamWidth: '',
    streamHeight: '',
    streamFps: '',
    streamBitrateKbps: '',
    recordingVideoCodec: 'h265' as VideoCodec,
    recordingWidth: '',
    recordingHeight: '',
    recordingFps: '',
    recordingBitrateKbps: '',
    audioEnabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const canAdvance = (() => {
    if (step === 0) {
      return form.ip.trim().length > 0 && form.port.trim().length > 0 && form.username.trim().length > 0 && form.password.trim().length > 0;
    }
    if (step === 1) {
      return form.name.trim().length > 0;
    }
    if (step === 2) {
      return form.retentionDays.trim().length > 0;
    }
    return true;
  })();

  const handlePrimary = async () => {
    if (step < steps.length - 1) {
      if (step === 0 && !detectedMax) {
        const detected = await handleTestConnection(false);
        if (!detected) return;
      }
      setStep((current) => current + 1);
      return;
    }

    setIsSaving(true);
    try {
      const clampToDetected = (
        label: string,
        rawValue: string,
        max: number | null | undefined,
        changes: string[],
      ): number | undefined => {
        if (!rawValue.trim()) return undefined;
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return undefined;
        if (max && max > 0 && value > max) {
          changes.push(`${label}: solicitado ${value}, aplicado ${max}`);
          return max;
        }
        return value;
      };
      const parseOptionalPositive = (rawValue: string): number | undefined => {
        if (!rawValue.trim()) return undefined;
        const value = Number(rawValue);
        return Number.isFinite(value) && value > 0 ? value : undefined;
      };

      const adjusted: string[] = [];
      const streamWidth = clampToDetected('Live largura', form.streamWidth, detectedMax?.width, adjusted);
      const streamHeight = clampToDetected('Live altura', form.streamHeight, detectedMax?.height, adjusted);
      const streamFps = clampToDetected('Live FPS', form.streamFps, detectedMax?.fps, adjusted);
      const streamBitrateKbps = form.streamBitrateKbps.trim()
        ? clampToDetected('Live bitrate', form.streamBitrateKbps, detectedMax?.bitrateKbps, adjusted)
        : undefined;
      const recordingWidth = parseOptionalPositive(form.recordingWidth);
      const recordingHeight = parseOptionalPositive(form.recordingHeight);
      const recordingFps = parseOptionalPositive(form.recordingFps);
      const recordingBitrateKbps = parseOptionalPositive(form.recordingBitrateKbps);

      if (adjusted.length) {
        window.alert(
          `Alguns valores foram ajustados para o máximo detectado da câmera:\n- ${adjusted.join('\n- ')}`,
        );
      }

      await onCreated({
        name: form.name.trim(),
        ip: form.ip.trim(),
        rtspPort: Number(form.port),
        onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
        username: form.username.trim(),
        password: form.password,
        rtspPath: form.rtspPath.trim() || undefined,
        onvifPath: form.onvifPath.trim() || undefined,
        onvifProfileToken: form.onvifProfileToken.trim() || undefined,
        channel: Number(form.channel || DEFAULT_CAMERA_CHANNEL),
        subtype: MAIN_STREAM_SUBTYPE,
        liveChannel: Number(form.channel || DEFAULT_CAMERA_CHANNEL),
        liveSubtype: MAIN_STREAM_SUBTYPE,
        recordingChannel: Number(form.channel || DEFAULT_CAMERA_CHANNEL),
        recordingSubtype: MAIN_STREAM_SUBTYPE,
        analyticsChannel: Number(form.channel || DEFAULT_CAMERA_CHANNEL),
        analyticsSubtype: ANALYTICS_STREAM_SUBTYPE,
        recordingEnabled: form.recordingMode !== 'manual',
        recordingMode: form.recordingMode as 'continuous' | 'motion' | 'schedule' | 'manual',
        retentionDays: Number(form.retentionDays),
        preferredRtspTransport: form.preferredRtspTransport as 'tcp' | 'udp',
        preferredLiveProtocol: normalizePreferredLiveProtocol(form.preferredLiveProtocol),
        streamVideoCodec: normalizeVideoCodec(form.streamVideoCodec),
        streamWidth,
        streamHeight,
        streamFps,
        streamBitrateKbps,
        recordingVideoCodec: normalizeVideoCodec(form.recordingVideoCodec),
        recordingWidth,
        recordingHeight,
        recordingFps,
        recordingBitrateKbps,
        audioEnabled: form.audioEnabled,
      });
      onClose();
    } catch (error) {
      window.alert(getRequestErrorMessage(error, 'Não foi possível adicionar a câmera.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (showResult = true): Promise<boolean> => {
    if (!form.ip.trim() || !form.port.trim()) {
      window.alert('Preencha IP e porta RTSP antes de testar conexão.');
      return false;
    }
    setIsTesting(true);
    try {
      const result = await onTestConnection({
        ip: form.ip.trim(),
        rtspPort: Number(form.port),
        onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
        username: form.username.trim(),
        password: form.password,
        rtspPath: form.rtspPath.trim() || undefined,
        onvifPath: form.onvifPath.trim() || undefined,
        onvifProfileToken: form.onvifProfileToken.trim() || undefined,
        channel: Number(form.channel || DEFAULT_CAMERA_CHANNEL),
        subtype: MAIN_STREAM_SUBTYPE,
      });
      if (result.suggestedRtspPath && !form.rtspPath.trim()) updateField('rtspPath', result.suggestedRtspPath);
      if (result.detectedStream?.codec) updateField('streamVideoCodec', normalizeVideoCodec(result.detectedStream.codec));
      setDetectedMax({
        width: typeof result.detectedStream?.width === 'number' ? result.detectedStream.width : null,
        height: typeof result.detectedStream?.height === 'number' ? result.detectedStream.height : null,
        fps: typeof result.detectedStream?.fps === 'number' ? result.detectedStream.fps : null,
        bitrateKbps: typeof result.detectedStream?.bitrateKbps === 'number' ? result.detectedStream.bitrateKbps : null,
      });
      const selectedPort = Number(form.port);
      if (
        typeof result.detectedRtspPort === 'number' &&
        result.detectedRtspPort === selectedPort &&
        result.detectedRtspPath
      ) {
        updateField('rtspPath', result.detectedRtspPath);
      }
      if (typeof result.detectedOnvifPort === 'number') updateField('onvifPort', String(result.detectedOnvifPort));
      if (result.detectedOnvifPath) updateField('onvifPath', result.detectedOnvifPath);
      if (result.detectedOnvifProfileToken) updateField('onvifProfileToken', result.detectedOnvifProfileToken);
      if (showResult) {
        window.alert(
          `Teste concluído\nRTSP: ${result.rtspAuthOk ? 'ok' : 'falhou'}\nONVIF: ${result.onvifReachable ? 'ok' : 'falhou'}\nPTZ/controle: ${result.ptzDigestOk ? 'ok' : 'não confirmado'}\nCodec detectado: ${result.detectedStream?.codec?.toUpperCase() ?? '-'}\nResolução detectada: ${result.detectedStream?.width && result.detectedStream?.height ? `${result.detectedStream.width}x${result.detectedStream.height}` : '-'}\nFPS detectado: ${result.detectedStream?.fps ?? '-'}\nBitrate detectado: ${result.detectedStream?.bitrateKbps ? `${result.detectedStream.bitrateKbps} kbps` : '-'}\nPerfis técnicos: configurados automaticamente\nStatus: ${result.status}${result.rtspProbeError ? `\nErro RTSP: ${result.rtspProbeError}` : ''}`,
        );
      }
      return true;
    } catch (error) {
      window.alert(getRequestErrorMessage(error, 'Falha ao testar conexão.'));
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-card border border-border rounded-lg w-[520px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Assistente de Nova Câmera</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Step indicators */}
        <div className="flex items-center px-5 py-3 border-b border-border">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${i === step ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : i < step ? 'bg-[hsl(var(--chart-3))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`ml-1.5 text-[11px] ${i === step ? 'text-foreground font-medium' : 'text-[hsl(var(--muted-foreground))]'}`}>{s}</span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border mx-2" />}
            </div>
          ))}
        </div>

        <div className="p-5 min-h-48">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Endereço IP</label>
                <input value={form.ip} onChange={(e) => updateField('ip', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="192.168.20.149" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Porta</label>
                  <input value={form.port} onChange={(e) => updateField('port', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="554" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Porta ONVIF</label>
                  <input value={form.onvifPort} onChange={(e) => updateField('onvifPort', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="80" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Protocolo</label>
                  <Select value={form.protocol} onValueChange={(value) => updateField('protocol', value)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtsp" className="text-xs">RTSP</SelectItem>
                      <SelectItem value="onvif" className="text-xs">ONVIF</SelectItem>
                      <SelectItem value="http" className="text-xs">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Usuário</label>
                  <input value={form.username} onChange={(e) => updateField('username', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="admin" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Senha</label>
                  <input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="********" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Canal</label>
                  <input value={form.channel} onChange={(e) => updateField('channel', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="1" />
                </div>
                <div className="col-span-2 rounded border border-border bg-background px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  Rotas RTSP, endpoint ONVIF, token de perfil e perfis de live/gravação/IA serão detectados e salvos internamente.
                </div>
              </div>
              <button onClick={() => void handleTestConnection()} disabled={isTesting} className="flex items-center gap-2 px-3 py-1.5 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Wifi className="w-3.5 h-3.5" />
                {isTesting ? 'Detectando...' : 'Detectar câmera'}
              </button>
              {detectedMax && (
                <div className="rounded border border-border bg-background px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  Capacidade máxima detectada:
                  <span className="ml-1 font-mono text-foreground">
                    {detectedMax.width && detectedMax.height ? `${detectedMax.width}x${detectedMax.height}` : '-'}
                  </span>
                  <span className="mx-2">|</span>
                  <span className="font-mono text-foreground">{detectedMax.fps ?? '-'} FPS</span>
                  <span className="mx-2">|</span>
                  <span className="font-mono text-foreground">{detectedMax.bitrateKbps ? `${detectedMax.bitrateKbps} kbps` : '-'}</span>
                </div>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Nome da Câmera</label>
                <input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" placeholder="Ex.: Legacy Camera - Canal 1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Zona</label>
                    <Select value={form.zone} onValueChange={(value) => updateField('zone', value)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar zona..." /></SelectTrigger>
                    <SelectContent>{validZones.map((zone) => <SelectItem key={zone} value={zone} className="text-xs">{zone}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Unidade</label>
                  <Select value={form.building} onValueChange={(value) => updateField('building', value)}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {validZones.map((zone) => <SelectItem key={zone} value={zone} className="text-xs">{zone}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                <div className="text-[11px] font-semibold">Perfil de Live</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Codec da origem Live</label>
                    <Select value={form.streamVideoCodec} onValueChange={(value) => updateField('streamVideoCodec', value)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original" className="text-xs">Detectar no perfil Live</SelectItem>
                        <SelectItem value="h264" className="text-xs">H.264</SelectItem>
                        <SelectItem value="h265" className="text-xs">H.265</SelectItem>
                        <SelectItem value="mjpeg" className="text-xs">MJPEG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Protocolo ao vivo</label>
                    <Select value={form.preferredLiveProtocol} onValueChange={(value) => updateField('preferredLiveProtocol', value as PreferredLiveProtocol)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto" className="text-xs">Padrão (WebRTC -&gt; LL-HLS -&gt; HLS)</SelectItem>
                        <SelectItem value="webrtc" className="text-xs">WebRTC</SelectItem>
                        <SelectItem value="llhls" className="text-xs">LL-HLS</SelectItem>
                        <SelectItem value="hls" className="text-xs">HLS</SelectItem>
                        <SelectItem value="mjpeg" className="text-xs">MJPEG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Transporte RTSP</label>
                    <Select value={form.preferredRtspTransport} onValueChange={(value) => updateField('preferredRtspTransport', value)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tcp" className="text-xs">TCP</SelectItem>
                        <SelectItem value="udp" className="text-xs">UDP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 rounded border border-border bg-card px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                    Live usa o perfil principal em alta qualidade. Se a origem for H.265, o sistema entrega H.264/WebRTC ao navegador.
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                <div className="text-[11px] font-semibold">Perfil de Gravação</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Modo de Gravação</label>
                    <Select value={form.recordingMode} onValueChange={(value) => updateField('recordingMode', value)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="continuous" className="text-xs">Contínua</SelectItem>
                        <SelectItem value="motion" className="text-xs">Por Movimento</SelectItem>
                        <SelectItem value="schedule" className="text-xs">Agenda</SelectItem>
                        <SelectItem value="manual" className="text-xs">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Retenção (dias)</label>
                    <input value={form.retentionDays} onChange={(e) => updateField('retentionDays', e.target.value)} className="w-full h-9 px-3 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Perfil de Gravação</label>
                    <Select value="main" disabled>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main" className="text-xs">Principal da câmera</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Codec de Arquivo</label>
                    <Select value="h265" disabled>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="h265" className="text-xs">H.265 / HEVC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 rounded border border-border bg-card px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                    A IA será configurada automaticamente para o substream leve direto da câmera.
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Endereço IP</span><span className="font-mono">{form.ip || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Porta</span><span className="font-mono">{form.port || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Porta ONVIF</span><span className="font-mono">{form.onvifPort || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Protocolo</span><span className="font-mono uppercase">{form.protocol}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Nome</span><span>{form.name || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Usuário</span><span>{form.username || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Canal</span><span className="font-mono">{form.channel || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Zona</span><span>{form.zone || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Unidade</span><span>{form.building || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Codec Live</span><span className="font-mono uppercase">{form.streamVideoCodec}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Protocolo Live</span><span className="font-mono">{formatLiveProtocol(form.preferredLiveProtocol)}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">RTSP Transport</span><span className="font-mono uppercase">{form.preferredRtspTransport}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Perfil Live</span><span>Principal da câmera</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Perfil IA</span><span>Substream leve automático</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Gravação</span><span className="capitalize">{form.recordingMode}</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Retenção</span><span className="font-mono">{form.retentionDays || '-'} dias</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Codec Gravação</span><span className="font-mono uppercase">H.265</span></div>
                {detectedMax && (
                  <div className="mt-2 rounded border border-border bg-card px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                    Detectado no perfil principal: <span className="font-mono text-foreground">{detectedMax.width && detectedMax.height ? `${detectedMax.width}x${detectedMax.height}` : '-'}</span>
                    <span className="mx-2">|</span>
                    <span className="font-mono text-foreground">{detectedMax.fps ?? '-'} FPS</span>
                    <span className="mx-2">|</span>
                    <span className="font-mono text-foreground">{detectedMax.bitrateKbps ? `${detectedMax.bitrateKbps} kbps` : '-'}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded border border-border text-xs hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >Voltar</button>
          <button
            onClick={() => void handlePrimary()}
            disabled={!canAdvance || isSaving}
            className="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >{isSaving ? 'Adicionando...' : step < steps.length - 1 ? 'Próximo' : 'Adicionar Câmera'}</button>
        </div>
      </div>
    </div>
  );
}

export default function CamerasPage() {
  const API_URL = getApiBaseUrl();
  const [, setLocation] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const loadData = useVmsDataStore((state) => state.load);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedCam, setSelectedCam] = useState<Camera | null>(null);
  const [reconnectingStale, setReconnectingStale] = useState(false);
  const [reconnectingSingleCameraId, setReconnectingSingleCameraId] = useState<string | null>(null);
  const [manualRecordingLoading, setManualRecordingLoading] = useState<{ cameraId: string; action: 'start' | 'stop' } | null>(null);
  const [motionRecordingLoadingCameraId, setMotionRecordingLoadingCameraId] = useState<string | null>(null);
  const [recordingOverrides, setRecordingOverrides] = useState<Record<string, boolean>>({});
  const [diagnosingPtzCameraId, setDiagnosingPtzCameraId] = useState<string | null>(null);
  const [recordingHealthByCamera, setRecordingHealthByCamera] = useState<Record<string, {
    total: number;
    broken: number;
    tooSmall: number;
    compatibleRecommended: number;
    directLikely: number;
    withAudio: number;
    lastRecordingAgeSeconds: number | null;
    needsAttention?: boolean;
    alertReason?: string | null;
  }>>({});
  const zones = ['all', ...Array.from(new Set(cameras.map((camera) => camera.zone)))];
  const isRecordingAutoRecovering = useCallback((camera: Camera | null | undefined) => (
    camera?.recordingStatusDetail === 'auto_reconnecting'
  ), []);
  const staleCameras = useMemo(
    () => cameras.filter((camera) => camera.recordingStale && !isRecordingAutoRecovering(camera)),
    [cameras, isRecordingAutoRecovering],
  );
  const isCameraRecording = useCallback((camera: Camera | null | undefined) => {
    if (!camera) return false;
    const override = recordingOverrides[camera.id];
    if (typeof override === 'boolean') return override;
    return camera.status === 'recording';
  }, [recordingOverrides]);
  const isMotionRecordingMode = useCallback((camera: Camera | null | undefined) => camera?.recordingMode === 'motion', []);
  const isMotionRecordingActive = useCallback((camera: Camera | null | undefined) => Boolean(camera && isMotionRecordingMode(camera) && isCameraRecording(camera)), [isCameraRecording, isMotionRecordingMode]);
  const selectedCamLive = useMemo(
    () => (selectedCam ? cameras.find((camera) => camera.id === selectedCam.id) ?? selectedCam : null),
    [cameras, selectedCam],
  );
  useEffect(() => {
    if (!accessToken) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    void axios.get(`${API_URL}/recordings/health-summary?date=${encodeURIComponent(today)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(({ data }) => {
      const map: Record<string, { total: number; broken: number; tooSmall: number; compatibleRecommended: number; directLikely: number; withAudio: number; lastRecordingAgeSeconds: number | null; needsAttention?: boolean; alertReason?: string | null }> = {};
      for (const item of Array.isArray(data?.cameras) ? data.cameras : []) {
        if (!item?.cameraId) continue;
        map[item.cameraId] = {
          total: Number(item.total ?? 0),
          broken: Number(item.broken ?? 0),
          tooSmall: Number(item.tooSmall ?? 0),
          compatibleRecommended: Number(item.compatibleRecommended ?? 0),
          directLikely: Number(item.directLikely ?? 0),
          withAudio: Number(item.withAudio ?? 0),
          lastRecordingAgeSeconds: typeof item.lastRecordingAgeSeconds === 'number' ? item.lastRecordingAgeSeconds : null,
          needsAttention: Boolean(item.needsAttention),
          alertReason: null,
        };
        map[item.cameraId].needsAttention = false;
      }
      setRecordingHealthByCamera(map);
    }).catch(() => setRecordingHealthByCamera({}));
  }, [API_URL, accessToken]);

  const filtered = cameras.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (zoneFilter !== 'all' && c.zone !== zoneFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    return true;
  });
  const recordingAttentionItems = useMemo(
    () => filtered.filter((camera) => recordingHealthByCamera[camera.id]?.needsAttention && !isRecordingAutoRecovering(camera)),
    [filtered, recordingHealthByCamera, isRecordingAutoRecovering],
  );

  const deleteCamera = async (camera: Camera) => {
    if (!accessToken) return;
    const confirmed = window.confirm(`Excluir câmera "${camera.name}" (${camera.code})?`);
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/cameras/${camera.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (selectedCam?.id === camera.id) setSelectedCam(null);
      await loadData();
    } catch {
      window.alert('Não foi possível excluir a câmera.');
    }
  };

  const createCamera = async (payload: {
    name: string;
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username: string;
    password: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
    liveChannel?: number;
    liveSubtype?: number;
    recordingChannel?: number;
    recordingSubtype?: number;
    analyticsChannel?: number;
    analyticsSubtype?: number;
    recordingEnabled: boolean;
    recordingMode: 'continuous' | 'motion' | 'schedule' | 'manual';
    retentionDays: number;
    preferredRtspTransport: 'tcp' | 'udp';
    preferredLiveProtocol: PreferredLiveProtocol;
    streamVideoCodec: VideoCodec;
    streamWidth?: number;
    streamHeight?: number;
    streamFps?: number;
    streamBitrateKbps?: number;
    recordingVideoCodec: VideoCodec;
    recordingWidth?: number;
    recordingHeight?: number;
    recordingFps?: number;
    recordingBitrateKbps?: number;
    audioEnabled: boolean;
  }) => {
    if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
    await axios.post(`${API_URL}/cameras`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await loadData();
  };

  const testConnectionDraft = async (payload: {
    ip: string;
    rtspPort: number;
    onvifPort?: number;
    username?: string;
    password?: string;
    rtspPath?: string;
    onvifPath?: string;
    onvifProfileToken?: string;
    channel?: number;
    subtype?: number;
  }) => {
    if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
    const { data } = await axios.post(`${API_URL}/cameras/test-connection-draft`, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data as {
      rtspReachable: boolean;
      rtspReachableAny?: boolean;
      reachableRtspPorts?: number[];
      onvifReachable: boolean;
      ptzDigestOk?: boolean;
      reachableOnvifPorts?: number[];
      rtspAuthOk?: boolean;
      selectedRtspPortAuthOk?: boolean;
      detectedRtspPort?: number | null;
      detectedRtspPath?: string | null;
      suggestedRtspPath?: string;
      detectedOnvifPort?: number | null;
      detectedOnvifPath?: string | null;
      detectedOnvifProfileToken?: string | null;
      rtspProbeError?: string | null;
      status: string;
    };
  };

  const reconnectStaleRecordings = async () => {
    if (!accessToken) return;
    if (!staleCameras.length) {
      window.alert('Nenhuma câmera pendente para reconectar.');
      return;
    }
    const confirmed = window.confirm(`Reconectar gravação em ${staleCameras.length} câmera(s)?`);
    if (!confirmed) return;
    setReconnectingStale(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/recordings/reconnect-stale`,
        { cameraIds: staleCameras.map((camera) => camera.id) },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      window.alert(`Reconexão concluída\nReiniciadas: ${data.restarted ?? 0}\nIgnoradas: ${data.skipped ?? 0}`);
      await loadData();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Falha ao reconectar gravações.');
    } finally {
      setReconnectingStale(false);
    }
  };

  const reconnectSingleCamera = async (cameraId: string) => {
    if (!accessToken || reconnectingSingleCameraId) return;
    setReconnectingSingleCameraId(cameraId);
    try {
      const { data } = await axios.post(
        `${API_URL}/recordings/reconnect-stale`,
        { cameraIds: [cameraId] },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      window.alert(`Reconexão da câmera concluída\nReiniciadas: ${data.restarted ?? 0}\nIgnoradas: ${data.skipped ?? 0}`);
      await loadData();
      const today = format(new Date(), 'yyyy-MM-dd');
      const summary = await axios.get(`${API_URL}/recordings/health-summary?date=${encodeURIComponent(today)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const map: Record<string, { total: number; broken: number; tooSmall: number; compatibleRecommended: number; directLikely: number; withAudio: number; lastRecordingAgeSeconds: number | null; needsAttention?: boolean; alertReason?: string | null }> = {};
      for (const item of Array.isArray(summary.data?.cameras) ? summary.data.cameras : []) {
        if (!item?.cameraId) continue;
        map[item.cameraId] = {
          total: Number(item.total ?? 0),
          broken: Number(item.broken ?? 0),
          tooSmall: Number(item.tooSmall ?? 0),
          compatibleRecommended: Number(item.compatibleRecommended ?? 0),
          directLikely: Number(item.directLikely ?? 0),
          withAudio: Number(item.withAudio ?? 0),
          lastRecordingAgeSeconds: typeof item.lastRecordingAgeSeconds === 'number' ? item.lastRecordingAgeSeconds : null,
          needsAttention: false,
          alertReason: null,
        };
      }
      setRecordingHealthByCamera(map);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Falha ao reconectar a câmera.');
    } finally {
      setReconnectingSingleCameraId(null);
    }
  };

  const diagnosePtzCamera = async (camera: Camera) => {
    if (!accessToken) return;
    if (!camera.ptzCapable) {
      window.alert('Esta câmera não possui PTZ habilitado.');
      return;
    }
    if (diagnosingPtzCameraId) return;
    setDiagnosingPtzCameraId(camera.id);
    try {
      const { data } = await axios.get<{
        configured?: { onvifPort?: number | null; onvifPath?: string | null; onvifProfileToken?: string | null };
        detected?: { onvifPort?: number | null; onvifPath?: string | null; onvifProfileToken?: string | null };
        ptzLikelyWorking?: boolean;
      }>(`${API_URL}/ptz/${camera.id}/diagnostics`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const configured = data?.configured ?? {};
      const detected = data?.detected ?? {};
      const resultLine = data?.ptzLikelyWorking ? 'Resultado: PTZ provável funcional' : 'Resultado: falha de comunicação PTZ';
      window.alert(
        [
          `Diagnóstico PTZ — ${camera.name}`,
          `Config: porta ${configured.onvifPort ?? '-'} | path ${configured.onvifPath ?? '-'} | token ${configured.onvifProfileToken ?? '-'}`,
          `Detectado: porta ${detected.onvifPort ?? '-'} | path ${detected.onvifPath ?? '-'} | token ${detected.onvifProfileToken ?? '-'}`,
          resultLine,
        ].join('\n'),
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Falha no diagnóstico PTZ.');
    } finally {
      setDiagnosingPtzCameraId(null);
    }
  };

  const runManualRecording = async (camera: Camera, action: 'start' | 'stop') => {
    if (!accessToken) return;
    setManualRecordingLoading({ cameraId: camera.id, action });
    setRecordingOverrides((current) => ({ ...current, [camera.id]: action === 'start' }));
    try {
      await axios.post(`${API_URL}/cameras/${camera.id}/recording/${action}`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await loadData();
      window.alert(action === 'start' ? `Gravação iniciada: ${camera.name}` : `Gravação parada: ${camera.name}`);
    } catch (error) {
      setRecordingOverrides((current) => ({ ...current, [camera.id]: camera.status === 'recording' }));
      window.alert(error instanceof Error ? error.message : `Falha ao ${action === 'start' ? 'iniciar' : 'parar'} gravação manual.`);
    } finally {
      setManualRecordingLoading(null);
    }
  };

  const runMotionRecording = async (camera: Camera) => {
    if (!accessToken || motionRecordingLoadingCameraId) return;
    setMotionRecordingLoadingCameraId(camera.id);
    try {
      if (isMotionRecordingActive(camera)) {
        setRecordingOverrides((current) => ({ ...current, [camera.id]: false }));
        await axios.post(`${API_URL}/cameras/${camera.id}/recording/stop`, {}, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        window.alert(`Clip por movimento parado: ${camera.name}\nA câmera continua armada para o próximo movimento.`);
      } else if (!isMotionRecordingMode(camera)) {
        setRecordingOverrides((current) => ({ ...current, [camera.id]: false }));
        await axios.post(`${API_URL}/cameras/${camera.id}/recording/motion`, { enabled: true }, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        window.alert(`Gravação por movimento ativada: ${camera.name}\nDetectou movimento, grava. Sem novo movimento por 60s, para sozinho.`);
      } else {
        window.alert(`Gravação por movimento já está armada: ${camera.name}\nO botão ficará vermelho quando a câmera estiver gravando um movimento.`);
      }
      await loadData();
    } catch (error) {
      setRecordingOverrides((current) => ({ ...current, [camera.id]: camera.status === 'recording' }));
      window.alert(error instanceof Error ? error.message : 'Falha ao atualizar gravação por movimento.');
    } finally {
      setMotionRecordingLoadingCameraId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 p-5">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border border-card-border bg-card rounded-xl shrink-0 flex-wrap gap-y-3 shadow-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            <input
              type="search"
              placeholder="Buscar câmeras..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 w-48 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] placeholder:text-[hsl(var(--muted-foreground)_/_0.5)]"
            />
          </div>
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{zones.map(z => <SelectItem key={z} value={z} className="text-xs">{z === 'all' ? 'Todas as zonas' : z}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{filtered.length} câmeras</span>
            <div className="flex items-center gap-0.5 p-0.5 rounded bg-[hsl(var(--muted))] border border-border">
              <button onClick={() => setViewMode('table')} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${viewMode === 'table' ? 'bg-card text-foreground' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}><List className="w-3.5 h-3.5" /></button>
              <button onClick={() => setViewMode('card')} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${viewMode === 'card' ? 'bg-card text-foreground' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity"
              data-testid="button-add-camera"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Câmera
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-card border border-card-border rounded-xl shadow-sm">
          {viewMode === 'table' ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  {['Código', 'Nome', 'Zona', 'Codec', 'Resolução', 'FPS', 'IP', 'Status', 'Gravação', 'Ações'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-[hsl(var(--muted-foreground))] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(cam => {
                  const recordingModeCopy = getRecordingModeCopy(cam.recordingMode);
                  return (
                  <tr
                    key={cam.id}
                    className="hover:bg-[hsl(var(--accent))] transition-colors cursor-pointer"
                    onClick={() => setLocation(`/cameras/${cam.id}`)}
                  >
                    <td className="px-3 py-2.5 font-mono text-[10px]">{cam.code}</td>
                    <td className="px-3 py-2.5 font-medium max-w-52 truncate">{cam.name}</td>
                    <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">{cam.zone}</td>
                    <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))] hidden lg:table-cell uppercase">{cam.streamVideoCodec ?? cam.detectedVideoCodec ?? '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] hidden xl:table-cell">{cam.resolution}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px]">{cam.fps}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))] hidden xl:table-cell">{cam.ipAddress}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono capitalize ${STATUS_BADGE[cam.status] ?? STATUS_BADGE.offline}`}>
                        {cam.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono ${recordingModeCopy.className}`}>
                          {recordingModeCopy.label}
                        </span>
                        <span className="text-[9px] text-[hsl(var(--muted-foreground))]">{cam.retentionDays}d · {recordingModeCopy.detail}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {recordingHealthByCamera[cam.id]?.needsAttention && !isRecordingAutoRecovering(cam) ? (
                          <button
                            onClick={() => void reconnectSingleCamera(cam.id)}
                            className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors"
                            title={reconnectingSingleCameraId === cam.id ? 'Reconectando...' : 'Reconectar gravação desta câmera'}
                            disabled={reconnectingSingleCameraId === cam.id}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${reconnectingSingleCameraId === cam.id ? 'animate-spin' : ''}`} />
                          </button>
                        ) : null}
                        <button onClick={() => setLocation(`/cameras/${cam.id}?tab=settings`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Editar câmera"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => void deleteCamera(cam)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors" title="Excluir câmera"><Trash2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setLocation(`/playback?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reprodução"><PlaySquare className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => void runManualRecording(cam, isCameraRecording(cam) ? 'stop' : 'start')}
                          className={`w-6 h-6 flex items-center justify-center rounded border transition-colors disabled:opacity-45 ${
                            isCameraRecording(cam)
                              ? 'border-red-500/55 text-red-400 hover:bg-red-500/10'
                              : 'border-emerald-500/55 text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={isCameraRecording(cam) ? 'Parar gravação manual' : 'Iniciar gravação manual'}
                          disabled={manualRecordingLoading?.cameraId === cam.id}
                        >
                          {manualRecordingLoading?.cameraId === cam.id ? (
                            <span className="text-[10px]">...</span>
                          ) : (
                            <Circle className={`w-3 h-3 ${isCameraRecording(cam) ? 'fill-current' : ''}`} />
                          )}
                        </button>
                        {cam.ptzCapable && <button onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="PTZ"><Crosshair className="w-3.5 h-3.5" /></button>}
                        {cam.ptzCapable && (
                          <button
                            onClick={() => void diagnosePtzCamera(cam)}
                            className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-45"
                            title={diagnosingPtzCameraId === cam.id ? 'Diagnosticando PTZ...' : 'Diagnosticar PTZ'}
                            disabled={diagnosingPtzCameraId === cam.id}
                          >
                            <Wifi className={`w-3.5 h-3.5 ${diagnosingPtzCameraId === cam.id ? 'animate-pulse' : ''}`} />
                          </button>
                        )}
                        <button className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reiniciar"><RefreshCw className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-5">
              {filtered.map(cam => {
                const recordingModeCopy = getRecordingModeCopy(cam.recordingMode);
                return (
                <div
                  key={cam.id}
                  className="bg-card border border-card-border rounded-xl overflow-hidden hover:border-[hsl(var(--primary)_/_0.4)] cursor-pointer transition-colors shadow-sm"
                  onClick={() => setLocation(`/cameras/${cam.id}`)}
                >
                  <div className="h-24 relative flex items-center justify-center" style={{ background: 'hsl(210,15%,8%)' }}>
                    <CameraIcon className="w-8 h-8 text-[hsl(var(--muted-foreground)_/_0.2)]" />
                    <div className="absolute top-2 left-2 font-mono text-[9px] text-white/50 bg-black/40 px-1.5 py-0.5 rounded">{cam.code}</div>
                    <div className="absolute top-2 right-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono capitalize ${STATUS_BADGE[cam.status] ?? STATUS_BADGE.offline}`}>
                        {cam.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-medium truncate mb-1">{cam.name}</div>
                    <div className="text-[10px] text-[hsl(var(--muted-foreground))] space-y-0.5">
                      <div>{cam.zone} · {cam.building}</div>
                      <div className="font-mono">{cam.model}</div>
                      <div className="font-mono">{cam.ipAddress}</div>
                      <div className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 font-mono text-[9px] ${recordingModeCopy.className}`}>
                        {recordingModeCopy.label}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {recordingHealthByCamera[cam.id]?.needsAttention && !isRecordingAutoRecovering(cam) ? (
                        <button
                          onClick={() => void reconnectSingleCamera(cam.id)}
                          className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors"
                          title={reconnectingSingleCameraId === cam.id ? 'Reconectando...' : 'Reconectar gravação desta câmera'}
                          disabled={reconnectingSingleCameraId === cam.id}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${reconnectingSingleCameraId === cam.id ? 'animate-spin' : ''}`} />
                        </button>
                      ) : null}
                      <button onClick={() => setLocation(`/cameras/${cam.id}?tab=settings`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors" title="Editar câmera"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => void deleteCamera(cam)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors" title="Excluir câmera"><Trash2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setLocation(`/playback?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="Reprodução"><PlaySquare className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => void runManualRecording(cam, isCameraRecording(cam) ? 'stop' : 'start')}
                        className={`w-6 h-6 flex items-center justify-center rounded border transition-colors disabled:opacity-45 ${
                          isCameraRecording(cam)
                            ? 'border-red-500/55 text-red-400 hover:bg-red-500/10'
                            : 'border-emerald-500/55 text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                        title={isCameraRecording(cam) ? 'Parar gravação manual' : 'Iniciar gravação manual'}
                        disabled={manualRecordingLoading?.cameraId === cam.id}
                      >
                        {manualRecordingLoading?.cameraId === cam.id ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <Circle className={`w-3 h-3 ${isCameraRecording(cam) ? 'fill-current' : ''}`} />
                        )}
                      </button>
                      {cam.ptzCapable && <button onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(cam.id)}`)} className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors" title="PTZ"><Crosshair className="w-3.5 h-3.5" /></button>}
                      {cam.ptzCapable && (
                        <button
                          onClick={() => void diagnosePtzCamera(cam)}
                          className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--chart-2))] hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-45"
                          title={diagnosingPtzCameraId === cam.id ? 'Diagnosticando PTZ...' : 'Diagnosticar PTZ'}
                          disabled={diagnosingPtzCameraId === cam.id}
                        >
                          <Wifi className={`w-3.5 h-3.5 ${diagnosingPtzCameraId === cam.id ? 'animate-pulse' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Camera detail panel */}
      <AnimatePresence>
        {selectedCam && (() => {
          const liveCam = selectedCamLive ?? selectedCam;
          const recordingModeCopy = getRecordingModeCopy(liveCam.recordingMode);
          const recordingActive = isCameraRecording(liveCam);
          const motionActive = isMotionRecordingActive(liveCam);
          return (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="ml-4 border border-card-border rounded-xl bg-card flex flex-col overflow-hidden shrink-0 shadow-sm"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-semibold truncate">{selectedCam.code}</h3>
              <button onClick={() => setSelectedCam(null)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="h-28 rounded border border-border flex items-center justify-center" style={{ background: 'hsl(210,15%,8%)' }}>
                <CameraIcon className="w-10 h-10 text-[hsl(var(--muted-foreground)_/_0.2)]" />
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5">{selectedCam.name}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono capitalize ${STATUS_BADGE[liveCam.status] ?? STATUS_BADGE.offline}`}>
                    {liveCam.status.replace('_', ' ')}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono ${recordingModeCopy.className}`}>
                    {recordingModeCopy.label}
                  </span>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  ['Código', selectedCam.code],
                  ['Zona', selectedCam.zone],
                  ['Unidade', selectedCam.building],
                  ['Andar', selectedCam.floor],
                  ['Endereço IP', selectedCam.ipAddress],
                  ['Modelo', selectedCam.model],
                  ['Resolução', selectedCam.resolution],
                  ['FPS', selectedCam.fps.toString()],
                  ['Gravação', recordingModeCopy.label],
                  ['Retenção', `${selectedCam.retentionDays} dias`],
                  ['PTZ', selectedCam.ptzCapable ? 'Sim' : 'Não'],
                  ['Áudio', selectedCam.hasAudio ? 'Sim' : 'Não'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => void reconnectSingleCamera(selectedCam.id)}
                    className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--destructive))] disabled:opacity-45"
                    disabled={reconnectingSingleCameraId === selectedCam.id || !recordingHealthByCamera[selectedCam.id]?.needsAttention || isRecordingAutoRecovering(selectedCam)}
                    title="Reconectar gravação"
                  >
                    <RefreshCw className={`w-4 h-4 ${reconnectingSingleCameraId === selectedCam.id ? 'animate-spin' : ''}`} />
                    {reconnectingSingleCameraId === selectedCam.id ? '...' : 'Reconectar'}
                  </button>
                  <button
                    onClick={() => void runManualRecording(liveCam, recordingActive ? 'stop' : 'start')}
                    className={`w-full h-9 rounded border text-xs flex items-center justify-center hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-45 ${
                      recordingActive
                        ? 'border-red-500/55 text-red-400'
                        : 'border-emerald-500/55 text-emerald-400'
                    }`}
                    disabled={manualRecordingLoading?.cameraId === selectedCam.id}
                    title={recordingActive ? 'Parar gravação manual' : 'Iniciar gravação manual'}
                  >
                    {manualRecordingLoading?.cameraId === selectedCam.id ? (
                      <span className="text-[10px]">...</span>
                    ) : (
                      <Circle className={`w-4 h-4 ${recordingActive ? 'fill-current' : ''}`} />
                    )}
                  </button>
                  <button
                    onClick={() => void runMotionRecording(liveCam)}
                    className={`w-full h-9 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-45 ${
                      motionActive
                        ? 'border-red-500/55 bg-red-500/10 text-red-400 hover:bg-red-500/15'
                        : 'border-emerald-500/55 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                    }`}
                    disabled={motionRecordingLoadingCameraId === selectedCam.id}
                    title={motionActive ? 'Parar clip atual por movimento' : 'Armar gravação por movimento'}
                  >
                    <Radar className={`w-4 h-4 ${motionRecordingLoadingCameraId === selectedCam.id ? 'animate-pulse' : ''}`} />
                    Movimento
                  </button>
                </div>
                <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold text-foreground">Regra atual:</span> {recordingModeCopy.detail}
                  {recordingActive ? ' Está gravando agora.' : ' Não está gravando agora.'}
                </div>
                <button onClick={() => setLocation(`/cameras/${selectedCam.id}?tab=settings`)} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <Edit className="w-4 h-4" /> Editar Câmera
                </button>
                <button onClick={() => void deleteCamera(selectedCam)} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--destructive))]">
                  <Trash2 className="w-4 h-4" /> Excluir Câmera
                </button>
                <button onClick={() => setLocation('/playback')} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                  <PlaySquare className="w-4 h-4" /> Abrir Reprodução
                </button>
                {selectedCam.ptzCapable && (
                  <button onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(selectedCam.id)}`)} className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors">
                    <Crosshair className="w-4 h-4" /> Controle PTZ
                  </button>
                )}
                {selectedCam.ptzCapable && (
                  <button
                    onClick={() => void diagnosePtzCamera(selectedCam)}
                    className="w-full h-9 rounded border border-border text-xs flex items-center justify-center gap-2 hover:bg-[hsl(var(--accent))] transition-colors"
                    disabled={diagnosingPtzCameraId === selectedCam.id}
                  >
                    <Wifi className={`w-4 h-4 ${diagnosingPtzCameraId === selectedCam.id ? 'animate-pulse' : ''}`} />
                    {diagnosingPtzCameraId === selectedCam.id ? 'Diagnosticando PTZ...' : 'Diagnosticar PTZ'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
          );
        })()}
      </AnimatePresence>

      {showWizard && <WizardModal onClose={() => setShowWizard(false)} zones={zones} onCreated={createCamera} onTestConnection={testConnectionDraft} />}
    </div>
  );
}
