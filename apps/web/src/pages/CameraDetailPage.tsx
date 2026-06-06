import axios from 'axios';
import { useCallback, useEffect, useMemo, useState, type InputHTMLAttributes, type MouseEvent, type ReactNode, type SelectHTMLAttributes, type WheelEvent as ReactWheelEvent } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BellRing,
  Camera,
  Circle,
  ChevronLeft,
  Crosshair,
  ExternalLink,
  LoaderCircle,
  Radar,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { LiveStreamPlayer, type LivePlayerStatus } from '../components/LiveStreamPlayer';
import { toast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import { sendPtzCommand, type PTZDirection } from '../lib/ptz';
import { useAuthStore } from '../store/authStore';
import { useVmsDataStore } from '../store/vmsDataStore';
import {
  getRecordingModeCopy,
  normalizePreferredLiveProtocol,
  normalizeVideoCodec,
  type RecordingMode,
  type VideoCodec,
} from '../lib/camera-format';

const API_URL = getApiBaseUrl();

const RESOLUTION_PRESETS = [
  { label: 'HD 720p', width: 1280, height: 720 },
  { label: 'Full HD 1080p', width: 1920, height: 1080 },
  { label: 'QHD 1440p', width: 2560, height: 1440 },
  { label: '4K UHD', width: 3840, height: 2160 },
] as const;

type CommandState = 'idle' | 'sending' | 'ok' | 'error';
type LiveSourceMode = 'original' | 'economical' | 'advanced';

type CameraConfig = {
  name: string;
  ip: string;
  rtspPort: string;
  onvifPort: string;
  username: string;
  password: string;
  rtspPath: string;
  onvifPath: string;
  onvifProfileToken: string;
  channel: string;
  subtype: string;
  liveChannel: string;
  liveSubtype: string;
  recordingChannel: string;
  recordingSubtype: string;
  analyticsChannel: string;
  analyticsSubtype: string;
  recordingEnabled: boolean;
  recordingMode: RecordingMode;
  retentionDays: string;
  preferredRtspTransport: 'tcp' | 'udp';
  preferredLiveProtocol: 'hls' | 'llhls' | 'webrtc' | 'mjpeg';
  streamVideoCodec: VideoCodec;
  streamWidth: string;
  streamHeight: string;
  streamFps: string;
  streamBitrateKbps: string;
  recordingVideoCodec: VideoCodec;
  recordingWidth: string;
  recordingHeight: string;
  recordingFps: string;
  recordingBitrateKbps: string;
  audioEnabled: boolean;
  alarmsEnabled: boolean;
  hasEdgeAi: boolean;
  motionTrigger: string;
};

type PtzDiagnostics = {
  cameraId: string;
  ip: string;
  configured: {
    onvifPort: number | null;
    onvifPath: string | null;
    onvifProfileToken: string | null;
    channel: number | null;
  };
  detected: {
    ok: boolean;
    protocol?: 'onvif' | 'vendor_http' | null;
    onvifPort: number | null;
    onvifPath: string | null;
    onvifProfileToken: string | null;
  };
  ptzLikelyWorking: boolean;
};

type RecordingRuntimeStatus = {
  isRecording: boolean;
  statusDetail?: string | null;
  lastSegmentAgeSeconds?: number | null;
};

type CameraPipelineSummary = {
  architecture?: {
    separated?: boolean;
    rule?: string;
  };
  live?: {
    channel?: number;
    subtype?: number;
    codec?: string | null;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    browserProtocol?: string | null;
    browserCodec?: string | null;
    transcodeForBrowser?: boolean;
    rtspUrl?: string | null;
  };
  recording?: {
    channel?: number;
    subtype?: number;
    sourceCodec?: string | null;
    targetCodec?: string | null;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    mode?: string | null;
    enabled?: boolean;
    rtspUrl?: string | null;
  };
  analytics?: {
    channel?: number;
    subtype?: number;
    source?: string | null;
    usesMediaMtx?: boolean;
    separatedFromLive?: boolean;
    expectedCodec?: string | null;
    rtspUrl?: string | null;
  };
  notes?: string[];
};

const emptyConfig: CameraConfig = {
  name: '',
  ip: '',
  rtspPort: '554',
  onvifPort: '80',
  username: '',
  password: '',
  rtspPath: '',
  onvifPath: '',
  onvifProfileToken: '',
  channel: '1',
  subtype: '0',
  liveChannel: '',
  liveSubtype: '',
  recordingChannel: '',
  recordingSubtype: '',
  analyticsChannel: '',
  analyticsSubtype: '',
  recordingEnabled: true,
  recordingMode: 'continuous',
  retentionDays: '7',
  preferredRtspTransport: 'tcp',
  preferredLiveProtocol: 'webrtc',
  streamVideoCodec: 'original',
  streamWidth: '1280',
  streamHeight: '720',
  streamFps: '',
  streamBitrateKbps: '',
  recordingVideoCodec: 'h265',
  recordingWidth: '',
  recordingHeight: '',
  recordingFps: '',
  recordingBitrateKbps: '',
  audioEnabled: false,
  alarmsEnabled: true,
  hasEdgeAi: false,
  motionTrigger: 'SYSTEM',
};

function resolveLiveSourceMode(liveSubtype: string, fallbackSubtype: string): LiveSourceMode {
  const selectedSubtype = Number(liveSubtype.trim() ? liveSubtype : fallbackSubtype);
  if (selectedSubtype === 0) return 'original';
  if (selectedSubtype === 1) return 'economical';
  return 'advanced';
}

function SettingsCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border/80 bg-background/65 p-4 shadow-sm">
      <div className="mb-4 border-b border-border/60 pb-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function SettingsField({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cn('grid gap-1.5', wide ? 'md:col-span-2' : '')}>
      <span className="pl-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="pl-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-11 w-full rounded-lg border border-border/80 bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-1 focus:ring-ring/20 placeholder:text-muted-foreground/70',
        props.className,
      )}
    />
  );
}

function SettingsSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-11 w-full rounded-lg border border-border/80 bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-1 focus:ring-ring/20',
        props.className,
      )}
    />
  );
}

function SettingsSwitch({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-card px-4 py-4 text-left transition hover:bg-accent/50"
      aria-pressed={checked}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <span className={cn('relative h-7 w-12 shrink-0 rounded-full border transition-colors', checked ? 'border-primary bg-primary' : 'border-border bg-muted')}>
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-1')} />
      </span>
    </button>
  );
}

function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium',
        tone === 'good' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        tone === 'bad' && 'border-red-500/30 bg-red-500/10 text-red-300',
        tone === 'neutral' && 'border-border bg-card text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}

// Relógio do OSD isolado: atualiza a cada segundo sem re-renderizar a página inteira.
function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className={className}>{now.toISOString().replace('T', ' ').substring(0, 19)}</span>;
}

function PtzButton({
  icon: Icon,
  label,
  active,
  disabled,
  onStart,
  onStop,
}: {
  icon: typeof ArrowUp;
  label: string;
  active: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onStart();
      }}
      onMouseUp={onStop}
      onMouseLeave={onStop}
      onTouchStart={(event) => {
        event.preventDefault();
        onStart();
      }}
      onTouchEnd={onStop}
      onTouchCancel={onStop}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-xl border transition-all select-none',
        active
          ? 'border-[hsl(var(--primary)_/_0.55)] bg-[hsl(var(--primary)_/_0.14)] text-[hsl(var(--primary))] shadow-[0_0_0_1px_hsl(var(--primary)_/_0.18)]'
          : 'border-border bg-card/70 text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)_/_0.35)] hover:bg-[hsl(var(--primary)_/_0.06)] hover:text-foreground',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const events = useVmsDataStore((state) => state.events);
  const dataLoaded = useVmsDataStore((state) => state.loaded);
  const isDataLoading = useVmsDataStore((state) => state.isLoading);
  const loadData = useVmsDataStore((state) => state.load);
  const cam = cameras.find((camera) => camera.id === params.id);

  const [activeDirection, setActiveDirection] = useState<PTZDirection | null>(null);
  const [commandState, setCommandState] = useState<CommandState>('idle');
  const [lastCommand, setLastCommand] = useState('Nenhum comando PTZ enviado');
  const [lastError, setLastError] = useState<string | null>(null);

  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const [draggingVideo, setDraggingVideo] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [form, setForm] = useState<CameraConfig>(emptyConfig);
  const [cameraConfigMeta, setCameraConfigMeta] = useState<any | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [reconnectingRecording, setReconnectingRecording] = useState(false);
  const [recordingActionLoading, setRecordingActionLoading] = useState<'start' | 'stop' | null>(null);
  const [motionRecordingLoading, setMotionRecordingLoading] = useState(false);
  const [recordingRuntimeStatus, setRecordingRuntimeStatus] = useState<RecordingRuntimeStatus | null>(null);
  const [recordingOverride, setRecordingOverride] = useState<boolean | null>(null);
  const [livePlayerStatus, setLivePlayerStatus] = useState<LivePlayerStatus>({
    activeProtocol: null,
    state: 'loading',
    reason: null,
  });
  const [liveConfigRevision, setLiveConfigRevision] = useState(0);
  const [discoveringEndpoints, setDiscoveringEndpoints] = useState(false);
  const [diagnosingPtz, setDiagnosingPtz] = useState(false);
  const [triggeringAlarm, setTriggeringAlarm] = useState(false);
  const [ptzDiagnostics, setPtzDiagnostics] = useState<PtzDiagnostics | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<CameraPipelineSummary | null>(null);

  const initialTabs = useMemo(() => {
    if (typeof window === 'undefined') {
      return { main: 'playback' as const };
    }
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'events' || tab === 'settings') return { main: tab };
    return { main: 'playback' as const };
  }, []);

  useEffect(() => {
    setLivePlayerStatus({ activeProtocol: null, state: 'loading', reason: null });
  }, [cam?.id]);

  useEffect(() => {
    if (!cam?.id || !accessToken) return;

    let cancelled = false;
    const loadCameraConfig = async () => {
      setConfigLoading(true);
      try {
        const [{ data }, pipelineResult] = await Promise.all([
          axios.get(`${API_URL}/cameras/${cam.id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          axios
            .get(`${API_URL}/cameras/${cam.id}/pipelines`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            .catch(() => ({ data: null })),
        ]);

        if (cancelled) return;

        setCameraConfigMeta(data);
        setPipelineSummary(pipelineResult.data);
        setForm({
          name: data.name ?? '',
          ip: data.ip ?? '',
          rtspPort: String(data.rtspPort ?? 554),
          onvifPort: data.onvifPort == null ? '' : String(data.onvifPort),
          username: data.username ?? '',
          password: '',
          rtspPath: data.rtspPath ?? '',
          onvifPath: data.onvifPath ?? '',
          onvifProfileToken: data.onvifProfileToken ?? '',
          channel: String(data.channel ?? 1),
          subtype: String(data.subtype ?? 0),
          liveChannel: data.liveChannel == null ? '' : String(data.liveChannel),
          liveSubtype: data.liveSubtype == null ? '' : String(data.liveSubtype),
          recordingChannel: data.recordingChannel == null ? '' : String(data.recordingChannel),
          recordingSubtype: data.recordingSubtype == null ? '' : String(data.recordingSubtype),
          analyticsChannel: data.analyticsChannel == null ? '' : String(data.analyticsChannel),
          analyticsSubtype: data.analyticsSubtype == null ? '' : String(data.analyticsSubtype),
          recordingEnabled: Boolean(data.recordingEnabled),
          recordingMode: data.recordingMode ?? (data.recordingEnabled ? 'continuous' : 'manual'),
          retentionDays: String(data.retentionDays ?? 7),
          preferredRtspTransport: data.preferredRtspTransport ?? 'tcp',
          preferredLiveProtocol: normalizePreferredLiveProtocol(data.preferredLiveProtocol),
          streamVideoCodec: normalizeVideoCodec(data.streamVideoCodec),
          streamWidth: data.streamWidth == null ? '' : String(data.streamWidth),
          streamHeight: data.streamHeight == null ? '' : String(data.streamHeight),
          streamFps: data.streamFps == null ? '' : String(data.streamFps),
          streamBitrateKbps: data.streamBitrateKbps == null ? '' : String(data.streamBitrateKbps),
          recordingVideoCodec: normalizeVideoCodec(data.recordingVideoCodec),
          recordingWidth: data.recordingWidth == null ? '' : String(data.recordingWidth),
          recordingHeight: data.recordingHeight == null ? '' : String(data.recordingHeight),
          recordingFps: data.recordingFps == null ? '' : String(data.recordingFps),
          recordingBitrateKbps: data.recordingBitrateKbps == null ? '' : String(data.recordingBitrateKbps),
          audioEnabled: Boolean(data.audioEnabled),
          alarmsEnabled: data.alarmsEnabled !== false,
          hasEdgeAi: Boolean(data.hasEdgeAi),
          motionTrigger: data.motionTrigger ?? 'SYSTEM',
        });
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'Falha ao carregar configuração da câmera',
            description: error instanceof Error ? error.message : 'Não foi possível carregar os parâmetros.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    };

    void loadCameraConfig();
    return () => {
      cancelled = true;
    };
  }, [accessToken, cam?.id]);

  useEffect(() => {
    setCameraConfigMeta(null);
    setPipelineSummary(null);
  }, [cam?.id]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, []);

  const controlsDisabled = !cam?.ptzCapable || !cam?.isOnline || commandState === 'sending';

  const startMove = useCallback(async (direction: PTZDirection) => {
    if (!cam || controlsDisabled) return;
    setActiveDirection(direction);
    setCommandState('sending');
    setLastError(null);
    setLastCommand(`Enviando ${direction} para ${cam.name}`);

    try {
      await sendPtzCommand(cam.id, { action: 'start', direction });
      setCommandState('ok');
      setLastCommand(`Movimento ${direction} ativo em ${cam.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao iniciar PTZ.';
      setActiveDirection(null);
      setCommandState('error');
      setLastError(message);
      setLastCommand(`Falha em ${direction} para ${cam.name}`);
      toast({
        title: 'Falha no PTZ',
        description: message,
        variant: 'destructive',
      });
    }
  }, [cam, controlsDisabled]);

  const stopMove = useCallback(async () => {
    if (!cam?.ptzCapable || !activeDirection || !cam) return;

    const direction = activeDirection;
    setActiveDirection(null);
    setCommandState('sending');

    try {
      await sendPtzCommand(cam.id, { action: 'stop', direction });
      setCommandState('ok');
      setLastError(null);
      setLastCommand(`Movimento ${direction} finalizado em ${cam.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao parar PTZ.';
      setCommandState('error');
      setLastError(message);
      setLastCommand(`Falha ao parar ${direction} em ${cam.name}`);
      toast({
        title: 'Falha ao parar PTZ',
        description: message,
        variant: 'destructive',
      });
    }
  }, [activeDirection, cam]);

  const handleVideoWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setVideoZoom((current) => {
      const next = Math.max(1, Math.min(5, Number((current + delta).toFixed(2))));
      if (next <= 1) {
        setVideoPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleVideoMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (videoZoom <= 1) return;
    event.preventDefault();
    setDraggingVideo(true);
    setDragStart({ x: event.clientX - videoPan.x, y: event.clientY - videoPan.y });
  }, [videoPan.x, videoPan.y, videoZoom]);

  const handleVideoMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!draggingVideo || !dragStart || videoZoom <= 1) return;
    const maxOffset = Math.max(0, ((videoZoom - 1) * 420) / 2);
    const nextX = event.clientX - dragStart.x;
    const nextY = event.clientY - dragStart.y;
    setVideoPan({
      x: Math.max(-maxOffset, Math.min(maxOffset, nextX)),
      y: Math.max(-maxOffset, Math.min(maxOffset, nextY)),
    });
  }, [dragStart, draggingVideo, videoZoom]);

  const handleVideoMouseUp = useCallback(() => {
    setDraggingVideo(false);
    setDragStart(null);
  }, []);

  const lockPageScroll = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
  }, []);

  useEffect(() => {
    const onGlobalWheel = (event: globalThis.WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const inCameraViewport = target.closest('[data-camera-viewport="true"]');
      if (!inCameraViewport) return;
      if (videoZoom <= 1) return;
      event.preventDefault();
    };
    window.addEventListener('wheel', onGlobalWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onGlobalWheel as EventListener);
    };
  }, [videoZoom]);

  const unlockPageScroll = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = '';
  }, []);

  // Só trava o scroll da página quando o vídeo está com zoom (>1), para o arrasto/pan
  // funcionar. Sem zoom, passar o mouse sobre o vídeo não deve impedir rolar a página.
  useEffect(() => {
    if (videoZoom > 1) lockPageScroll();
    else unlockPageScroll();
  }, [videoZoom, lockPageScroll, unlockPageScroll]);

  const updateField = <K extends keyof CameraConfig>(key: K, value: CameraConfig[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const getResolutionPresetValue = (width: string, height: string) => {
    if (!width.trim() || !height.trim()) return 'original';
    const w = Number(width);
    const h = Number(height);
    const matched = RESOLUTION_PRESETS.find((preset) => preset.width === w && preset.height === h);
    return matched ? `${matched.width}x${matched.height}` : '';
  };

  const applyResolutionPreset = (mode: 'stream' | 'recording', value: string) => {
    if (!value) return;
    if (value === 'original') {
      if (mode === 'stream') {
        updateField('streamWidth', '');
        updateField('streamHeight', '');
        updateField('streamFps', '');
        updateField('streamBitrateKbps', '');
        return;
      }
      updateField('recordingWidth', '');
      updateField('recordingHeight', '');
      updateField('recordingFps', '');
      updateField('recordingBitrateKbps', '');
      return;
    }
    const [w, h] = value.split('x');
    if (!w || !h) return;
    if (mode === 'stream') {
      updateField('streamWidth', w);
      updateField('streamHeight', h);
      return;
    }
    updateField('recordingWidth', w);
    updateField('recordingHeight', h);
  };

  const applyLiveSourceMode = (value: LiveSourceMode) => {
    if (value === 'advanced') return;
    setForm((current) => ({
      ...current,
      liveSubtype: value === 'original' ? '0' : '1',
      streamVideoCodec: 'original',
      streamWidth: current.streamWidth || '1280',
      streamHeight: current.streamHeight || '720',
      streamFps: '',
      streamBitrateKbps: '',
    }));
  };

  const saveSettings = async () => {
    if (!cam?.id || !accessToken) return;
    setConfigSaving(true);

    try {
      const detectedWidth = cam.detectedWidth ?? null;
      const detectedHeight = cam.detectedHeight ?? null;
      const detectedFps = cam.detectedFps ?? null;
      const detectedBitrate = cam.detectedBitrateKbps ?? null;

      const clampedFields: string[] = [];
      const clampToDetected = (label: string, value: string, max: number | null): number | null => {
        if (!value.trim()) return null;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        if (max && max > 0) {
          const clamped = Math.min(numeric, max);
          if (clamped !== numeric) {
            clampedFields.push(`${label}: solicitado ${numeric}, aplicado ${clamped} (max detectado ${max})`);
          }
          return clamped;
        }
        return numeric;
      };
      const parseOptionalPositive = (value: string): number | null => {
        if (!value.trim()) return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      };

      const { data: updatedCamera } = await axios.patch(
        `${API_URL}/cameras/${cam.id}`,
        {
          name: form.name.trim(),
          ip: form.ip.trim(),
          rtspPort: Number(form.rtspPort),
          onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
          username: form.username.trim(),
          password: form.password.trim() ? form.password : undefined,
          rtspPath: form.rtspPath.trim(),
          onvifPath: form.onvifPath.trim(),
          onvifProfileToken: form.onvifProfileToken.trim(),
          channel: Number(form.channel),
          subtype: Number(form.subtype),
          liveChannel: form.liveChannel.trim() ? Number(form.liveChannel) : null,
          liveSubtype: form.liveSubtype.trim() ? Number(form.liveSubtype) : null,
          recordingChannel: form.recordingChannel.trim() ? Number(form.recordingChannel) : null,
          recordingSubtype: form.recordingSubtype.trim() ? Number(form.recordingSubtype) : null,
          analyticsChannel: form.analyticsChannel.trim() ? Number(form.analyticsChannel) : null,
          analyticsSubtype: form.analyticsSubtype.trim() ? Number(form.analyticsSubtype) : null,
          recordingEnabled: form.recordingEnabled,
          recordingMode: form.recordingMode,
          retentionDays: Number(form.retentionDays),
          preferredRtspTransport: form.preferredRtspTransport,
          preferredLiveProtocol: form.preferredLiveProtocol,
          streamVideoCodec: normalizeVideoCodec(form.streamVideoCodec),
          streamWidth: clampToDetected('Live largura', form.streamWidth, detectedWidth),
          streamHeight: clampToDetected('Live altura', form.streamHeight, detectedHeight),
          streamFps: clampToDetected('Live FPS', form.streamFps, detectedFps),
          streamBitrateKbps: clampToDetected('Live bitrate', form.streamBitrateKbps, detectedBitrate),
          recordingVideoCodec: normalizeVideoCodec(form.recordingVideoCodec),
          recordingWidth: parseOptionalPositive(form.recordingWidth),
          recordingHeight: parseOptionalPositive(form.recordingHeight),
          recordingFps: parseOptionalPositive(form.recordingFps),
          recordingBitrateKbps: parseOptionalPositive(form.recordingBitrateKbps),
          audioEnabled: form.audioEnabled,
          alarmsEnabled: form.alarmsEnabled,
          hasEdgeAi: form.hasEdgeAi,
          motionTrigger: form.motionTrigger,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      setCameraConfigMeta(updatedCamera);
      await loadData();
      setLiveConfigRevision((current) => current + 1);
      axios
        .get(`${API_URL}/cameras/${cam.id}/pipelines`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .then(({ data }) => setPipelineSummary(data))
        .catch(() => undefined);
      setForm((current) => ({ ...current, password: '' }));
      const appliedLiveResolution = form.streamWidth && form.streamHeight ? `${form.streamWidth}x${form.streamHeight}` : 'Sem redimensionamento';
      toast({
        title: 'Configuração salva',
        description: clampedFields.length
          ? `A câmera ${cam.name} foi atualizada com ajustes automáticos: ${clampedFields.join(' | ')} | Perfil live aplicado: ${appliedLiveResolution}`
          : `A câmera ${cam.name} foi atualizada com sucesso. Perfil live aplicado: ${appliedLiveResolution}`,
      });
    } catch (error) {
      toast({
        title: 'Falha ao salvar câmera',
        description: error instanceof Error ? error.message : 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const runConnectionTest = async () => {
    if (!cam?.id || !accessToken) return;
    setTestingConnection(true);

    try {
      const { data } = await axios.post<{
        rtspReachable?: boolean;
        selectedRtspPortAuthOk?: boolean;
        rtspAuthOk?: boolean;
        onvifReachable?: boolean;
        ptzDigestOk?: boolean;
        status?: string;
      }>(
        `${API_URL}/cameras/${cam.id}/test-connection`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      const rtspAuthFailed = data.rtspReachable && data.selectedRtspPortAuthOk === false;
      const onvifAuthFailed = data.onvifReachable && data.ptzDigestOk === false;
      toast({
        title: 'Teste de conexao concluido',
        description: rtspAuthFailed
          ? 'A câmera respondeu, mas recusou usuário ou senha.'
          : onvifAuthFailed
            ? 'A câmera respondeu, mas recusou o controle externo.'
            : data.rtspReachable
              ? 'Câmera respondendo corretamente.'
              : 'Não foi possível confirmar o vídeo desta câmera.',
        variant: rtspAuthFailed || onvifAuthFailed ? 'destructive' : undefined,
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'Falha no teste de conexão',
        description: error instanceof Error ? error.message : 'Não foi possível testar a câmera.',
        variant: 'destructive',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const discoverEndpoints = async () => {
    if (!accessToken) return;
    setDiscoveringEndpoints(true);
    try {
      const { data } = await axios.post<{
        rtspAuthOk?: boolean;
        selectedRtspPortAuthOk?: boolean;
        detectedRtspPort?: number | null;
        detectedRtspPath?: string | null;
        detectedStream?: {
          codec?: string | null;
          width?: number | null;
          height?: number | null;
          fps?: number | null;
          bitrateKbps?: number | null;
        } | null;
        detectedOnvifPort?: number | null;
        detectedOnvifPath?: string | null;
        detectedOnvifProfileToken?: string | null;
      }>(
        `${API_URL}/cameras/test-connection-draft`,
        {
          ip: form.ip.trim(),
          rtspPort: Number(form.rtspPort),
          onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
          username: form.username.trim(),
          password: form.password.trim() || undefined,
          rtspPath: form.rtspPath.trim() || undefined,
          onvifPath: form.onvifPath.trim() || undefined,
          onvifProfileToken: form.onvifProfileToken.trim() || undefined,
          channel: Number(form.channel),
          subtype: Number(form.subtype),
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (data.detectedRtspPath) {
        updateField('rtspPath', data.detectedRtspPath);
      }
      if (data.detectedStream?.codec) {
        updateField('streamVideoCodec', normalizeVideoCodec(data.detectedStream.codec));
      }
      if (typeof data.detectedStream?.width === 'number') {
        updateField('streamWidth', String(data.detectedStream.width));
      }
      if (typeof data.detectedStream?.height === 'number') {
        updateField('streamHeight', String(data.detectedStream.height));
      }
      if (typeof data.detectedStream?.fps === 'number') {
        updateField('streamFps', String(data.detectedStream.fps));
      }
      if (typeof data.detectedStream?.bitrateKbps === 'number') {
        updateField('streamBitrateKbps', String(data.detectedStream.bitrateKbps));
        if (!form.recordingBitrateKbps.trim()) {
          updateField('recordingBitrateKbps', String(data.detectedStream.bitrateKbps));
        }
      }
      if (typeof data.detectedOnvifPort === 'number') {
        updateField('onvifPort', String(data.detectedOnvifPort));
      }
      if (data.detectedOnvifPath) {
        updateField('onvifPath', data.detectedOnvifPath);
      }
      if (data.detectedOnvifProfileToken) {
        updateField('onvifProfileToken', data.detectedOnvifProfileToken);
      }

      toast({
        title: 'Deteccao concluida',
        description: data.rtspAuthOk || data.selectedRtspPortAuthOk
          ? 'Os dados encontrados foram aplicados automaticamente.'
          : 'Não foi possível confirmar o vídeo com os dados atuais.',
      });
    } catch (error) {
      toast({
        title: 'Falha na descoberta',
        description: error instanceof Error ? error.message : 'Não foi possível descobrir endpoints da câmera.',
        variant: 'destructive',
      });
    } finally {
      setDiscoveringEndpoints(false);
    }
  };

  const reconnectRecording = async () => {
    if (!cam?.id || !accessToken) return;
    setReconnectingRecording(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/recordings/reconnect-stale`,
        { cameraIds: [cam.id] },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      toast({
        title: 'Reconexão de gravação executada',
        description: `Reiniciadas: ${data.restarted ?? 0} | Ignoradas: ${data.skipped ?? 0}`,
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'Falha na reconexão de gravação',
        description: error instanceof Error ? error.message : 'Não foi possível reconectar gravação.',
        variant: 'destructive',
      });
    } finally {
      setReconnectingRecording(false);
    }
  };

  const loadRecordingStatus = useCallback(async () => {
    if (!cam?.id || !accessToken) return;
    try {
      const { data } = await axios.get<RecordingRuntimeStatus>(
        `${API_URL}/cameras/${cam.id}/recording/status`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      setRecordingRuntimeStatus(data);
      setRecordingOverride(null);
    } catch {
      setRecordingRuntimeStatus(null);
    }
  }, [accessToken, cam?.id]);

  useEffect(() => {
    void loadRecordingStatus();
  }, [loadRecordingStatus]);

  useEffect(() => {
    setRecordingOverride(null);
  }, [cam?.id]);

  const isRecordingActive = recordingOverride ?? recordingRuntimeStatus?.isRecording ?? (cam?.status === 'recording');
  const isMotionRecordingMode = form.recordingMode === 'motion' || cam?.recordingMode === 'motion';
  const isMotionRecordingActive = isMotionRecordingMode && isRecordingActive;
  const cameraMeta = cameraConfigMeta ?? cam;
  const resolutionMatch = cam?.resolution?.match(/(\d+)\s*x\s*(\d+)/i) ?? null;
  const originalWidth = cameraMeta?.recordingWidth ?? cameraMeta?.detectedWidth ?? cameraMeta?.streamWidth ?? (resolutionMatch ? Number(resolutionMatch[1]) : null);
  const originalHeight = cameraMeta?.recordingHeight ?? cameraMeta?.detectedHeight ?? cameraMeta?.streamHeight ?? (resolutionMatch ? Number(resolutionMatch[2]) : null);
  const originalFps = cameraMeta?.recordingFps ?? cameraMeta?.detectedFps ?? cam?.fps ?? null;
  const originalCodecValue = normalizeVideoCodec(cameraMeta?.recordingVideoCodec ?? cameraMeta?.detectedVideoCodec ?? cameraMeta?.streamVideoCodec);
  const originalCodec = originalCodecValue.toUpperCase();
  const originalBitrate = cameraMeta?.recordingBitrateKbps ?? cameraMeta?.detectedBitrateKbps ?? cameraMeta?.streamBitrateKbps ?? null;
  const liveSourceMode = resolveLiveSourceMode(form.liveSubtype, form.subtype);
  const liveSourceLabel = liveSourceMode === 'original'
      ? 'Original da câmera'
      : liveSourceMode === 'economical'
      ? 'Econômico'
      : `Perfil personalizado ${form.liveSubtype || form.subtype || '--'}`;
  const recordingModeCopy = getRecordingModeCopy(form.recordingMode);

  const startManualRecording = async () => {
    if (!cam?.id || !accessToken) return;
    setRecordingOverride(true);
    setRecordingActionLoading('start');
    try {
      await axios.post(
        `${API_URL}/cameras/${cam.id}/recording/start`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      toast({ title: 'Gravação iniciada', description: `A câmera ${cam.name} entrou em gravação manual.` });
      await Promise.all([loadData(), loadRecordingStatus()]);
    } catch (error) {
      setRecordingOverride(null);
      toast({
        title: 'Falha ao iniciar gravação',
        description: error instanceof Error ? error.message : 'Não foi possível iniciar a gravação manual.',
        variant: 'destructive',
      });
    } finally {
      setRecordingActionLoading(null);
    }
  };

  const stopManualRecording = async () => {
    if (!cam?.id || !accessToken) return;
    setRecordingOverride(false);
    setRecordingActionLoading('stop');
    try {
      await axios.post(
        `${API_URL}/cameras/${cam.id}/recording/stop`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      toast({ title: 'Gravação parada', description: `A gravação manual da câmera ${cam.name} foi encerrada.` });
      await Promise.all([loadData(), loadRecordingStatus()]);
    } catch (error) {
      setRecordingOverride(null);
      toast({
        title: 'Falha ao parar gravação',
        description: error instanceof Error ? error.message : 'Não foi possível parar a gravação manual.',
        variant: 'destructive',
      });
    } finally {
      setRecordingActionLoading(null);
    }
  };

  const handleMotionRecording = async (enabled: boolean) => {
    if (!cam?.id || !accessToken || motionRecordingLoading) return;
    setMotionRecordingLoading(true);
    try {
      if (enabled) {
        await axios.post(
          `${API_URL}/cameras/${cam.id}/recording/motion`,
          { enabled: true },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        setForm((current) => ({ ...current, recordingMode: 'motion', recordingEnabled: false }));
        setRecordingOverride(false);
        toast({
          title: 'Gravação por movimento ativada',
          description: 'Ao detectar movimento, o sistema grava e mantém o clip por 60s após o último movimento.',
        });
      } else {
        if (isMotionRecordingActive) {
          setRecordingOverride(false);
          await axios.post(
            `${API_URL}/cameras/${cam.id}/recording/stop`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
        }
        await axios.post(
          `${API_URL}/cameras/${cam.id}/recording/motion`,
          { enabled: false },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        setForm((current) => ({ ...current, recordingMode: 'manual', recordingEnabled: false }));
        toast({
          title: 'Gravação por movimento desativada',
          description: 'A câmera não iniciará gravação automática por detecção de movimento.',
        });
      }
      await Promise.all([loadData(), loadRecordingStatus()]);
    } catch (error) {
      setRecordingOverride(null);
      toast({
        title: 'Falha na gravação por movimento',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o modo por movimento.',
        variant: 'destructive',
      });
    } finally {
      setMotionRecordingLoading(false);
    }
  };

  const runPtzDiagnostics = async () => {
    if (!cam?.id || !accessToken) return;
    setDiagnosingPtz(true);
    try {
      const { data } = await axios.get<PtzDiagnostics>(
        `${API_URL}/ptz/${cam.id}/diagnostics`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      setPtzDiagnostics(data);
      toast({
        title: data.ptzLikelyWorking ? 'Controle PTZ pronto' : 'Controle PTZ indisponivel',
        description: data.ptzLikelyWorking
          ? 'A câmera aceitou o controle externo.'
          : 'Não foi possível confirmar o controle externo desta câmera.',
        variant: data.ptzLikelyWorking ? undefined : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Falha no diagnóstico PTZ',
        description: error instanceof Error ? error.message : 'Não foi possível diagnosticar PTZ.',
        variant: 'destructive',
      });
    } finally {
      setDiagnosingPtz(false);
    }
  };

  const triggerCameraAlarm = async () => {
    if (!cam?.id || !accessToken || triggeringAlarm) return;
    setTriggeringAlarm(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/ptz/${cam.id}/relays/trigger`,
        { token: 'alarmout-0', durationMs: 1500 },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (data.status === 'error') {
        throw new Error(data.message ?? 'A câmera não aceitou o comando de alarme.');
      }
      toast({
        title: 'Alarme acionado',
        description: `Pulso de alarme enviado para ${cam.name} por 1,5s.`,
      });
    } catch (error) {
      toast({
        title: 'Falha ao acionar alarme',
        description: error instanceof Error ? error.message : 'Não foi possível acionar a saída de alarme da câmera.',
        variant: 'destructive',
      });
    } finally {
      setTriggeringAlarm(false);
    }
  };

  if (!cam) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {isDataLoading || !dataLoaded ? 'Carregando câmera...' : 'Câmera não encontrada.'}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-6 py-3">
        <button
          onClick={() => setLocation('/cameras')}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Câmeras
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{cam.name}</span>
            <span className="hidden text-xs text-muted-foreground md:inline">{cam.ipAddress}</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <StatusPill label={cam.isOnline ? 'Online' : 'Offline'} tone={cam.isOnline ? 'good' : 'bad'} />
          <StatusPill label={isRecordingActive ? 'Gravando' : 'Sem gravação'} tone={isRecordingActive ? 'warn' : 'neutral'} />
          <StatusPill label={livePlayerStatus.activeProtocol ?? 'Live'} />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div
              className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black"
              data-camera-viewport="true"
              onWheel={handleVideoWheel}
              onWheelCapture={handleVideoWheel}
              onMouseDown={handleVideoMouseDown}
              onMouseMove={handleVideoMouseMove}
              onMouseUp={handleVideoMouseUp}
              onMouseLeave={handleVideoMouseUp}
              style={{ cursor: videoZoom > 1 ? (draggingVideo ? 'grabbing' : 'grab') : 'default', touchAction: 'none', overscrollBehavior: 'contain' }}
            >
              {cam.isOnline ? (
                <div
                  className="absolute inset-0 h-full w-full"
                  style={{ transform: `translate(${videoPan.x}px, ${videoPan.y}px) scale(${videoZoom})`, transformOrigin: 'center center' }}
                >
                  <LiveStreamPlayer
                    key={`${cam.id}-${liveConfigRevision}`}
                    cameraId={cam.id}
                    cameraName={cam.name}
                    className="absolute inset-0 h-full w-full"
                    muted
                    showOverlay
                    aiEnabled={cam.aiEnabled}
                    liveViewMode="selected"
                    onStatusChange={setLivePlayerStatus}
                  />
                </div>
              ) : null}
              <div className="scan-line-overlay absolute inset-0" />
              {!cam.isOnline && <Camera className="h-12 w-12 text-slate-700" />}
              <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
                <div className={cn('h-2 w-2 rounded-full', isRecordingActive ? 'rec-pulse bg-red-500' : 'bg-emerald-400')} />
                <span className="rounded bg-black/60 px-1.5 text-xs font-mono text-white/80">{cam.code}</span>
              </div>
              <div className="absolute bottom-2 left-2 right-2 z-10 flex justify-between">
                <span className="rounded bg-black/60 px-1.5 text-[10px] font-mono text-white/70">{cam.ipAddress}</span>
                <LiveClock className="rounded bg-black/60 px-1.5 text-[10px] font-mono text-white/70" />
              </div>
            </div>
          </div>

          <div className="flex max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-lg border border-border bg-card/80">
            <div className="grid grid-cols-2 gap-2 p-3">
              <button
                type="button"
                onClick={() => void reconnectRecording()}
                disabled={reconnectingRecording || cam.recordingStatusDetail === 'auto_reconnecting'}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background/55 text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-50"
              >
                {reconnectingRecording ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {reconnectingRecording || cam.recordingStatusDetail === 'auto_reconnecting' ? 'Reconectando...' : 'Reconectar'}
              </button>
              <button
                type="button"
                onClick={() => void (isRecordingActive ? stopManualRecording() : startManualRecording())}
                disabled={recordingActionLoading !== null}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-background/55 text-xs disabled:opacity-50',
                  isRecordingActive
                    ? 'border-red-500/45 text-red-300 hover:bg-red-500/10'
                    : 'border-emerald-500/45 text-emerald-300 hover:bg-emerald-500/10',
                )}
                title={isRecordingActive ? 'Parar gravação manual' : 'Iniciar gravação manual'}
              >
                {recordingActionLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Circle className={cn('h-3.5 w-3.5', isRecordingActive && 'fill-current')} />
                )}
                {isRecordingActive ? 'Parar' : 'Gravar'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {cam.ptzCapable ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-foreground">PTZ</p>
                    <button
                      type="button"
                      onClick={() => void stopMove()}
                      disabled={!activeDirection}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Stop
                    </button>
                  </div>
                  <div className="mx-auto grid w-fit grid-cols-3 gap-2">
                    <div />
                    <PtzButton icon={ArrowUp} label="Cima" active={activeDirection === 'Up'} disabled={controlsDisabled} onStart={() => void startMove('Up')} onStop={() => void stopMove()} />
                    <div />
                    <PtzButton icon={ArrowLeft} label="Esquerda" active={activeDirection === 'Left'} disabled={controlsDisabled} onStart={() => void startMove('Left')} onStop={() => void stopMove()} />
                    <button
                      type="button"
                      onClick={() => void stopMove()}
                      disabled={!activeDirection}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-[hsl(var(--accent))] disabled:opacity-40"
                      title="Parar movimento"
                    >
                      <Crosshair className="h-4 w-4" />
                    </button>
                    <PtzButton icon={ArrowRight} label="Direita" active={activeDirection === 'Right'} disabled={controlsDisabled} onStart={() => void startMove('Right')} onStop={() => void stopMove()} />
                    <div />
                    <PtzButton icon={ArrowDown} label="Baixo" active={activeDirection === 'Down'} disabled={controlsDisabled} onStart={() => void startMove('Down')} onStop={() => void stopMove()} />
                    <div />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PtzButton icon={ZoomIn} label="Zoom In" active={activeDirection === 'ZoomIn'} disabled={controlsDisabled} onStart={() => void startMove('ZoomIn')} onStop={() => void stopMove()} />
                    <PtzButton icon={ZoomOut} label="Zoom Out" active={activeDirection === 'ZoomOut'} disabled={controlsDisabled} onStart={() => void startMove('ZoomOut')} onStop={() => void stopMove()} />
                  </div>
                  <div className="rounded-md border border-border bg-background/55 px-2.5 py-2 text-[11px] text-muted-foreground">
                    {commandState === 'error' ? 'Erro operacional' : commandState === 'sending' ? 'Enviando comando...' : 'Pronto'}
                    <div className="mt-1 font-mono text-[10px]">{lastCommand}</div>
                    {lastError ? <div className="mt-1 text-[hsl(var(--destructive))]">{lastError}</div> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void runPtzDiagnostics()}
                    disabled={diagnosingPtz}
                    className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-border text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                  >
                    {diagnosingPtz ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
                    Verificar PTZ
                  </button>
                  {ptzDiagnostics ? (
                    <div className="rounded-md border border-border bg-background/55 px-2.5 py-2 text-[11px] text-muted-foreground">
                      {ptzDiagnostics.ptzLikelyWorking
                        ? 'Controle PTZ disponivel.'
                        : 'Controle PTZ ainda sem validacao.'}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void triggerCameraAlarm()}
                    disabled={triggeringAlarm || !cam.isOnline}
                    className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs font-medium text-amber-300 hover:bg-amber-500/15 disabled:opacity-50"
                    title="Aciona a saída de alarme por 1,5s e desliga automaticamente"
                  >
                    {triggeringAlarm ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                    Acionar alarme
                  </button>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-background/55 px-2.5 py-2 text-xs text-muted-foreground">
                  Esta câmera não suporta controles PTZ.
                </div>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue={initialTabs.main} className="w-full">
          <TabsList className="h-8 border border-border bg-card">
            {[
              ['playback', 'Reprodução'],
              ['events', 'Eventos'],
              ['settings', 'Configurações'],
            ].map(([tab, label]) => (
              <TabsTrigger key={tab} value={tab} className="h-6 px-3 text-xs capitalize">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="playback" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Reprodução</p>
                  <p className="mt-1 text-sm font-semibold">Revisão forense desta câmera</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLocation(`/playback?cameraId=${encodeURIComponent(cam.id)}`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs hover:bg-[hsl(var(--accent))]"
                >
                  Abrir reprodução
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-background/55 p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Modo de gravação</div>
                  <div className={cn('mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold', recordingModeCopy.className)}>
                    {recordingModeCopy.label}
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{recordingModeCopy.detail}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/55 p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Retenção</div>
                  <div className="mt-2 text-sm font-semibold">{cam.retentionDays} dias</div>
                </div>
                <div className="rounded-xl border border-border bg-background/55 p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Armazenamento</div>
                  <div className="mt-2 text-sm font-semibold">{cam.storage}</div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            <div className="space-y-2">
              {events
                .filter((event) => event.cameraId === cam.id)
                .slice(0, 8)
                .map((event) => (
                  <div key={event.id} className="flex items-center gap-3 rounded border border-border bg-card/40 px-4 py-2 text-xs">
                    <span className="font-mono text-muted-foreground">{new Date(event.timestamp).toISOString().substring(11, 19)}</span>
                    <Badge variant="outline" className="border-slate-500/30 bg-slate-500/15 text-[10px] text-slate-400">
                      {event.type}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{event.description}</span>
                  </div>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card/80 shadow-sm">
              <div className="border-b border-border bg-card px-5 py-4 xl:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">Configurações</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Ajustes essenciais da câmera. Configurações técnicas ficam recolhidas.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void runConnectionTest()}
                      disabled={testingConnection || configLoading}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {testingConnection ? 'Testando...' : 'Testar conexão'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void discoverEndpoints()}
                      disabled={discoveringEndpoints || configLoading}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {discoveringEndpoints ? 'Descobrindo...' : 'Detectar automaticamente'}
                    </button>
                  </div>
                </div>
              </div>

              {configLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Carregando parâmetros da câmera...</div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveSettings();
                  }}
                  className="space-y-5 px-4 py-5 md:px-5 xl:px-6"
                >
                  <details className="rounded-lg border border-border/70 bg-background/55 px-4 py-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Informações detectadas da câmera</summary>
                    <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 text-xs md:grid-cols-4">
                      <div><span className="text-muted-foreground">Codec</span><div className="mt-1 font-medium text-foreground">{originalCodec}</div></div>
                      <div><span className="text-muted-foreground">Resolução</span><div className="mt-1 font-medium text-foreground">{originalWidth && originalHeight ? `${originalWidth}x${originalHeight}` : '--'}</div></div>
                      <div><span className="text-muted-foreground">FPS</span><div className="mt-1 font-medium text-foreground">{originalFps ? `${originalFps} FPS` : '--'}</div></div>
                      <div><span className="text-muted-foreground">Bitrate</span><div className="mt-1 font-medium text-foreground">{originalBitrate ? `${originalBitrate} kbps` : '--'}</div></div>
                    </div>
                  </details>

                  <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="space-y-4">
                      <SettingsCard title="Identificação e acesso">
                        <div className="grid gap-3 md:grid-cols-2">
                          <SettingsField label="Nome da câmera">
                            <SettingsInput value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                          </SettingsField>
                          <SettingsField label="Endereço IP">
                            <SettingsInput value={form.ip} onChange={(event) => updateField('ip', event.target.value)} className="font-mono" />
                          </SettingsField>
                          <SettingsField label="Usuário">
                            <SettingsInput value={form.username} onChange={(event) => updateField('username', event.target.value)} />
                          </SettingsField>
                          <SettingsField label="Senha" hint="Deixe em branco para manter a senha atual.">
                            <SettingsInput type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
                          </SettingsField>
                          <SettingsField label="Porta de vídeo">
                            <SettingsInput type="number" min={1} value={form.rtspPort} onChange={(event) => updateField('rtspPort', event.target.value)} className="font-mono" />
                          </SettingsField>
                        </div>
                        <details className="rounded-lg border border-border/70 bg-card/60 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Controle e descoberta</summary>
                          <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 md:grid-cols-2">
                            <SettingsField label="Porta de controle">
                              <SettingsInput type="number" min={1} value={form.onvifPort} onChange={(event) => updateField('onvifPort', event.target.value)} className="font-mono" />
                            </SettingsField>
                          </div>
                        </details>
                      </SettingsCard>

                      <SettingsCard title="Perfis">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live</div>
                            <div className="mt-1 text-sm font-medium text-foreground">Principal · canal {pipelineSummary?.live?.channel ?? (form.liveChannel || form.channel || '1')} / subtipo {pipelineSummary?.live?.subtype ?? (form.liveSubtype || '0')}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {pipelineSummary?.live?.width && pipelineSummary?.live?.height ? `${pipelineSummary.live.width}x${pipelineSummary.live.height}` : 'Resolução original'} · {(pipelineSummary?.live?.browserProtocol ?? 'webrtc').toUpperCase()}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gravação</div>
                            <div className="mt-1 text-sm font-medium text-foreground">Principal · canal {pipelineSummary?.recording?.channel ?? (form.recordingChannel || form.channel || '1')} / subtipo {pipelineSummary?.recording?.subtype ?? (form.recordingSubtype || '0')}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Arquivo {pipelineSummary?.recording?.targetCodec ? pipelineSummary.recording.targetCodec.toUpperCase() : 'cópia da fonte'} · {pipelineSummary?.recording?.enabled ? 'habilitada' : 'opcional'}
                            </div>
                          </div>
                          <div className={cn(
                            'rounded-lg border px-3 py-2',
                            pipelineSummary?.analytics?.separatedFromLive === false
                              ? 'border-amber-500/35 bg-amber-500/10'
                              : 'border-border/70 bg-card',
                          )}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">IA</div>
                            <div className="mt-1 text-sm font-medium text-foreground">Substream · canal {pipelineSummary?.analytics?.channel ?? (form.analyticsChannel || form.channel || '1')} / subtipo {pipelineSummary?.analytics?.subtype ?? (form.analyticsSubtype || '1')}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {pipelineSummary?.analytics?.usesMediaMtx ? 'via MediaMTX' : 'direto da câmera'} · sem áudio
                            </div>
                          </div>
                        </div>
                        <details className="rounded-lg border border-border/70 bg-card/60 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Arquitetura técnica</summary>
                          <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
                            <div className="flex justify-between gap-3"><span>Live</span><span className="truncate font-mono">{pipelineSummary?.live?.rtspUrl ?? 'rtsp://... main'}</span></div>
                            <div className="flex justify-between gap-3"><span>Gravação</span><span className="truncate font-mono">{pipelineSummary?.recording?.rtspUrl ?? 'rtsp://... main'}</span></div>
                            <div className="flex justify-between gap-3"><span>IA</span><span className="truncate font-mono">{pipelineSummary?.analytics?.rtspUrl ?? 'rtsp://... substream'}</span></div>
                            {pipelineSummary?.notes?.map((note) => (
                              <div key={note} className="rounded border border-border/60 bg-background/50 px-2 py-1">{note}</div>
                            ))}
                          </div>
                        </details>
                      </SettingsCard>

                      <SettingsCard title="Live">
                        <div className="grid gap-3 md:grid-cols-3">
                          <SettingsField label="Fonte da imagem" hint="Original usa o perfil principal entregue pela câmera. Econômico usa substream.">
                            <SettingsSelect value={liveSourceMode} onChange={(event) => applyLiveSourceMode(event.target.value as LiveSourceMode)}>
                              <option value="original">Original da câmera</option>
                              <option value="economical">Econômico</option>
                              {liveSourceMode === 'advanced' ? <option value="advanced">Perfil personalizado</option> : null}
                            </SettingsSelect>
                          </SettingsField>
                          <SettingsField label="Resolução em live" hint="Original mantém a resolução real do perfil escolhido.">
                            <SettingsSelect
                              value={getResolutionPresetValue(form.streamWidth, form.streamHeight) || 'custom'}
                              onChange={(event) => applyResolutionPreset('stream', event.target.value)}
                            >
                              <option value="custom" disabled>Personalizada</option>
                              <option value="original">Original da câmera</option>
                              {RESOLUTION_PRESETS.map((preset) => (
                                <option key={`stream-${preset.width}x${preset.height}`} value={`${preset.width}x${preset.height}`}>
                                  {preset.label}
                                </option>
                              ))}
                            </SettingsSelect>
                          </SettingsField>
                          <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live no navegador</div>
                            <div className="mt-1 text-sm font-medium text-foreground">WebRTC</div>
                          </div>
                          <details className="md:col-span-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2">
                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Codec, protocolo e rede</summary>
                            <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 md:grid-cols-2">
                              <SettingsField label="Codec recebido">
                                <SettingsSelect value={form.streamVideoCodec} onChange={(event) => updateField('streamVideoCodec', event.target.value as CameraConfig['streamVideoCodec'])}>
                                  <option value="original">Detectar no perfil live</option>
                                  <option value="h264">H.264</option>
                                  <option value="h265">H.265</option>
                                  <option value="mjpeg">MJPEG</option>
                                </SettingsSelect>
                              </SettingsField>
                              <SettingsField label="Protocolo ao vivo">
                                <SettingsSelect value={form.preferredLiveProtocol} onChange={(event) => updateField('preferredLiveProtocol', event.target.value as CameraConfig['preferredLiveProtocol'])}>
                                  <option value="webrtc">WebRTC</option>
                                  <option value="llhls">LL-HLS</option>
                                  <option value="hls">HLS</option>
                                  <option value="mjpeg">MJPEG</option>
                                </SettingsSelect>
                              </SettingsField>
                              <SettingsField label="Transporte RTSP">
                                <SettingsSelect value={form.preferredRtspTransport} onChange={(event) => updateField('preferredRtspTransport', event.target.value as CameraConfig['preferredRtspTransport'])}>
                                  <option value="tcp">TCP</option>
                                  <option value="udp">UDP</option>
                                </SettingsSelect>
                              </SettingsField>
                              <SettingsField label="FPS da live">
                                <SettingsInput type="number" min={1} value={form.streamFps} onChange={(event) => updateField('streamFps', event.target.value)} className="font-mono" />
                              </SettingsField>
                              <SettingsField label="Bitrate da live">
                                <SettingsInput type="number" min={1} value={form.streamBitrateKbps} onChange={(event) => updateField('streamBitrateKbps', event.target.value)} className="font-mono" />
                              </SettingsField>
                            </div>
                          </details>
                        </div>
                      </SettingsCard>
                    </div>

                    <div className="space-y-4">
                      <SettingsCard title="Operação">
                        <SettingsSwitch
                          checked={form.recordingEnabled}
                          onChange={(value) => updateField('recordingEnabled', value)}
                          label="Gravação habilitada"
                          description="Permite que o backend grave esta câmera conforme o modo abaixo."
                        />
                        <SettingsSwitch
                          checked={form.audioEnabled}
                          onChange={(value) => updateField('audioEnabled', value)}
                          label="Áudio habilitado"
                          description="Usa áudio no perfil operacional quando o stream suportar."
                        />
                        <SettingsSwitch
                          checked={form.alarmsEnabled}
                          onChange={(value) => updateField('alarmsEnabled', value)}
                          label="Alarmes habilitados"
                          description="Quando desligado, esta câmera não abre novos alarmes (eventos continuam registrados)."
                        />
                      </SettingsCard>

                      <SettingsCard title="Gravação">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                          <SettingsField label="Modo">
                            <SettingsSelect value={form.recordingMode} onChange={(event) => updateField('recordingMode', event.target.value as CameraConfig['recordingMode'])}>
                              <option value="continuous">Contínua</option>
                              <option value="motion">Movimento</option>
                              <option value="schedule">Agenda</option>
                              <option value="manual">Manual</option>
                            </SettingsSelect>
                          </SettingsField>
                          <SettingsField label="Retenção">
                            <SettingsInput type="number" min={1} value={form.retentionDays} onChange={(event) => updateField('retentionDays', event.target.value)} className="font-mono" />
                          </SettingsField>
                          <details className="rounded-lg border border-border/70 bg-card/60 px-3 py-2">
                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Avançado</summary>
                            <div className="mt-3 grid gap-3 border-t border-border/70 pt-3">
                              <SettingsField label="Codec de arquivo" hint="A gravação arquiva o codec original da câmera (cópia, sem reconversão).">
                                <SettingsSelect value="copy" disabled>
                                  <option value="copy">Original da câmera (cópia)</option>
                                </SettingsSelect>
                              </SettingsField>
                              <SettingsField label="Resolução">
                                <SettingsSelect
                                  value={getResolutionPresetValue(form.recordingWidth, form.recordingHeight) || 'custom'}
                                  onChange={(event) => applyResolutionPreset('recording', event.target.value)}
                                >
                                  <option value="custom" disabled>Personalizada</option>
                                  <option value="original">Original da câmera</option>
                                  {RESOLUTION_PRESETS.map((preset) => (
                                    <option key={`recording-${preset.width}x${preset.height}`} value={`${preset.width}x${preset.height}`}>
                                      {preset.label}
                                    </option>
                                  ))}
                                </SettingsSelect>
                              </SettingsField>
                              <SettingsField label="FPS">
                                <SettingsInput type="number" min={1} value={form.recordingFps} onChange={(event) => updateField('recordingFps', event.target.value)} className="font-mono" />
                              </SettingsField>
                              <SettingsField label="Bitrate">
                                <SettingsInput type="number" min={1} value={form.recordingBitrateKbps} onChange={(event) => updateField('recordingBitrateKbps', event.target.value)} className="font-mono" />
                              </SettingsField>
                            </div>
                          </details>
                        </div>
                      </SettingsCard>

                      <SettingsCard title="IA">
                        <div className="space-y-4">
                          <label className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer">
                            <input
                              type="radio"
                              name="motionTrigger"
                              value="SYSTEM"
                              checked={form.motionTrigger === 'SYSTEM'}
                              onChange={() => updateField('motionTrigger', 'SYSTEM')}
                              className="h-4 w-4 accent-primary"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">Análise pelo servidor</span>
                              <span className="text-xs text-muted-foreground">Padrão recomendado para detecção visual.</span>
                            </div>
                          </label>
                          <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${!form.hasEdgeAi ? 'opacity-50 grayscale' : 'hover:bg-muted/50'}`}>
                            <input
                              type="radio"
                              name="motionTrigger"
                              value="CAMERA"
                              disabled={!form.hasEdgeAi}
                              checked={form.motionTrigger === 'CAMERA'}
                              onChange={() => updateField('motionTrigger', 'CAMERA')}
                              className="h-4 w-4 accent-primary"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">Usar alerta da câmera</span>
                              <span className="text-xs text-muted-foreground">{form.hasEdgeAi ? 'A câmera avisa o sistema quando houver movimento.' : 'Esta câmera não informou suporte a esse recurso.'}</span>
                            </div>
                          </label>
                        </div>
                      </SettingsCard>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 border-t border-border/80 pt-6 md:flex-row md:items-center md:justify-between">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Resumo:</span> live em {liveSourceLabel.toLowerCase()}, gravação {getRecordingModeCopy(form.recordingMode).label.toLowerCase()}.
                    </div>
                    <button
                      type="submit"
                      disabled={configSaving || configLoading}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {configSaving ? 'Salvando...' : 'Salvar configurações'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
