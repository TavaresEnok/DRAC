import axios from 'axios';
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type WheelEvent } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronLeft,
  Crosshair,
  ExternalLink,
  LoaderCircle,
  Radar,
  RotateCcw,
  Settings2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { LiveStreamPlayer } from '../components/LiveStreamPlayer';
import { toast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import { sendPtzCommand, type PTZDirection } from '../lib/ptz';
import { useAuthStore } from '../store/authStore';
import { useVmsDataStore } from '../store/vmsDataStore';

const API_URL = getApiBaseUrl();

const statusColor = (s: string) => {
  if (s === 'online' || s === 'recording') return 'bg-green-500/15 text-green-400 border-green-500/30';
  if (s === 'offline' || s === 'no_signal') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (s === 'motion' || s === 'alarm') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
};

type CommandState = 'idle' | 'sending' | 'ok' | 'error';

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
  recordingEnabled: boolean;
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
  recordingEnabled: true,
};

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
  const loadData = useVmsDataStore((state) => state.load);
  const cam = cameras.find((camera) => camera.id === params.id) ?? cameras[0];

  const [motionSensitivity, setMotionSensitivity] = useState([65]);
  const [activeDirection, setActiveDirection] = useState<PTZDirection | null>(null);
  const [commandState, setCommandState] = useState<CommandState>('idle');
  const [lastCommand, setLastCommand] = useState('Nenhum comando PTZ enviado');
  const [lastError, setLastError] = useState<string | null>(null);

  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const [draggingVideo, setDraggingVideo] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [form, setForm] = useState<CameraConfig>(emptyConfig);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [discoveringEndpoints, setDiscoveringEndpoints] = useState(false);

  const initialTab = useMemo(() => {
    if (typeof window === 'undefined') return 'playback';
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'events' || tab === 'ptz' || tab === 'settings' ? tab : 'playback';
  }, []);

  useEffect(() => {
    if (!cam?.id || !accessToken) return;

    let cancelled = false;
    const loadCameraConfig = async () => {
      setConfigLoading(true);
      try {
        const { data } = await axios.get(`${API_URL}/cameras/${cam.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (cancelled) return;

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
          recordingEnabled: Boolean(data.recordingEnabled),
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
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, []);

  const controlsDisabled = !cam?.ptzCapable || !cam.isOnline || commandState === 'sending';

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
      await sendPtzCommand(cam.id, { action: 'stop' });
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

  const handleVideoWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
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

  const unlockPageScroll = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = '';
  }, []);

  const updateField = <K extends keyof CameraConfig>(key: K, value: CameraConfig[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    if (!cam?.id || !accessToken) return;
    setConfigSaving(true);

    try {
      await axios.patch(
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
          recordingEnabled: form.recordingEnabled,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      await loadData();
      setForm((current) => ({ ...current, password: '' }));
      toast({
        title: 'Configuração salva',
        description: `A câmera ${cam.name} foi atualizada com sucesso.`,
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
      const { data } = await axios.post(
        `${API_URL}/cameras/${cam.id}/test-connection`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      toast({
        title: 'Teste de conexão concluído',
        description: `RTSP: ${data.rtspReachable ? 'ok' : 'falhou'} | ONVIF: ${data.onvifReachable ? 'ok' : 'falhou'} | Status: ${String(data.status ?? '-')}`,
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
        title: 'Descoberta concluída',
        description: `RTSP porta informada: ${data.selectedRtspPortAuthOk ? 'ok' : 'falhou'} | RTSP em alguma porta: ${data.rtspAuthOk ? 'ok' : 'falhou'}${typeof data.detectedRtspPort === 'number' ? ` | Porta RTSP detectada: ${data.detectedRtspPort}` : ''}`,
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

  if (!cam) {
    return <div className="p-6 text-sm text-muted-foreground">Câmera não encontrada.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3">
        <button
          onClick={() => setLocation('/cameras')}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Lista de Câmeras
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold">{cam.name}</span>
        <Badge variant="outline" className={cn('ml-1 text-[10px]', statusColor(cam.status))}>
          {cam.status.replace('_', ' ')}
        </Badge>
        {cam.ptzCapable && (
          <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1 text-[9px] font-bold uppercase text-blue-400">
            PTZ
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Endereço IP', value: cam.ipAddress, mono: true },
            { label: 'Modelo', value: cam.model, mono: true },
            { label: 'Resolução', value: cam.resolution, mono: true },
            { label: 'Armazenamento', value: cam.storage, mono: true },
            { label: 'Zona', value: cam.zone, mono: false },
            { label: 'Unidade', value: cam.building, mono: false },
            { label: 'Gravação', value: cam.recordingMode, mono: false },
            { label: 'Retenção', value: `${cam.retentionDays}d`, mono: true },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-card p-3">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className={cn('text-sm font-medium', item.mono && 'font-mono')}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <div
              className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black"
              onWheel={handleVideoWheel}
              onWheelCapture={handleVideoWheel}
              onMouseDown={handleVideoMouseDown}
              onMouseMove={handleVideoMouseMove}
              onMouseUp={handleVideoMouseUp}
              onMouseLeave={handleVideoMouseUp}
              onMouseEnter={lockPageScroll}
              onMouseOut={unlockPageScroll}
              style={{ cursor: videoZoom > 1 ? (draggingVideo ? 'grabbing' : 'grab') : 'default', touchAction: 'none', overscrollBehavior: 'contain' }}
            >
              {cam.isOnline ? (
                <div
                  className="absolute inset-0 h-full w-full"
                  style={{ transform: `translate(${videoPan.x}px, ${videoPan.y}px) scale(${videoZoom})`, transformOrigin: 'center center' }}
                >
                  <LiveStreamPlayer cameraId={cam.id} cameraName={cam.name} className="absolute inset-0 h-full w-full" muted={!cam.hasAudio} />
                </div>
              ) : null}
              <div className="scan-line-overlay absolute inset-0" />
              {!cam.isOnline && <Camera className="h-12 w-12 text-slate-700" />}
              <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
                <div className="rec-pulse h-2 w-2 rounded-full bg-red-500" />
                <span className="rounded bg-black/60 px-1.5 text-xs font-mono text-white/80">{cam.code}</span>
              </div>
              <div className="absolute bottom-2 left-2 right-2 z-10 flex justify-between">
                <span className="rounded bg-black/60 px-1.5 text-[10px] font-mono text-white/70">{cam.ipAddress}</span>
                <span className="rounded bg-black/60 px-1.5 text-[10px] font-mono text-white/70">
                  {new Date().toISOString().replace('T', ' ').substring(0, 19)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Informações do Stream</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">URL</span></div>
              <p className="break-all rounded bg-background px-2 py-1 font-mono text-[10px] text-primary">rtsp://{cam.ipAddress}/stream</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Localização</span></div>
              <p className="text-xs">{cam.location}</p>
              <div className="flex justify-between"><span className="text-muted-foreground">FPS</span><span className="font-mono">{cam.fps}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Áudio</span><span className="font-mono">{cam.hasAudio ? 'Sim' : 'Não'}</span></div>
            </div>
          </div>
        </div>

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="h-8 border border-border bg-card">
            {['playback', 'events', 'ptz', 'settings'].map((tab) => (
              <TabsTrigger key={tab} value={tab} className="h-6 px-3 text-xs capitalize">
                {tab === 'ptz' ? 'Controle PTZ' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="playback" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Workspace de Reprodução</p>
                  <p className="mt-1 text-sm font-semibold">Revisão forense desta câmera</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLocation(`/playback?cameraId=${encodeURIComponent(cam.id)}`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs hover:bg-[hsl(var(--accent))]"
                >
                  Abrir Reprodução
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-background/55 p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Modo de Gravação</div>
                  <div className="mt-2 text-sm font-semibold">{cam.recordingMode}</div>
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

          <TabsContent value="ptz" className="mt-4">
            {cam.ptzCapable ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_360px]">
                <div className="rounded-[22px] border border-border bg-[linear-gradient(160deg,hsl(222_22%_9%),hsl(220_18%_7%))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Painel de Comando PTZ</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">Controle real ONVIF desta câmera</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocation(`/ptz?cameraId=${encodeURIComponent(cam.id)}`)}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 text-xs text-white/80 hover:bg-black/40"
                    >
                      Painel avançado
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Direcional</div>
                          <div className="mt-1 text-xs text-white/75">Clique e segure para mover</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void stopMove()}
                          disabled={!activeDirection}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-white/75 hover:bg-white/5 disabled:opacity-40"
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
                          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/35 text-white/75 hover:bg-black/50 disabled:opacity-40"
                          title="Parar movimento"
                        >
                          <Crosshair className="h-4 w-4" />
                        </button>
                        <PtzButton icon={ArrowRight} label="Direita" active={activeDirection === 'Right'} disabled={controlsDisabled} onStart={() => void startMove('Right')} onStop={() => void stopMove()} />
                        <div />
                        <PtzButton icon={ArrowDown} label="Baixo" active={activeDirection === 'Down'} disabled={controlsDisabled} onStart={() => void startMove('Down')} onStop={() => void stopMove()} />
                        <div />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <PtzButton icon={ZoomIn} label="Zoom In" active={activeDirection === 'ZoomIn'} disabled={controlsDisabled} onStart={() => void startMove('ZoomIn')} onStop={() => void stopMove()} />
                        <PtzButton icon={ZoomOut} label="Zoom Out" active={activeDirection === 'ZoomOut'} disabled={controlsDisabled} onStart={() => void startMove('ZoomOut')} onStop={() => void stopMove()} />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Estado PTZ</div>
                        <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                          {commandState === 'sending' ? <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--primary))]" /> : <Radar className="h-4 w-4 text-[hsl(var(--primary))]" />}
                          {commandState === 'error' ? 'Erro operacional' : commandState === 'sending' ? 'Enviando comando' : 'Pronto'}
                        </div>
                        <div className="mt-2 text-xs text-white/65">{lastCommand}</div>
                        {lastError && (
                          <div className="mt-3 rounded-xl border border-[hsl(var(--destructive)_/_0.28)] bg-[hsl(var(--destructive)_/_0.08)] px-3 py-2 text-xs text-[hsl(var(--destructive))]">
                            {lastError}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Integridade</div>
                        <div className="mt-3 space-y-2 text-xs text-white/70">
                          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <span>Stream online</span>
                            <span className="font-mono">{cam.isOnline ? 'sim' : 'não'}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <span>Áudio no live</span>
                            <span className="font-mono">{cam.hasAudio ? 'sim' : 'não'}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <span>Suporte PTZ</span>
                            <span className="font-mono">{cam.ptzCapable ? 'onvif' : 'não'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:col-span-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <Settings2 className="h-4 w-4 text-[hsl(var(--primary))]" />
                          Comandos disponíveis
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-white/70 md:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Movimentos `Up`, `Down`, `Left`, `Right` via ONVIF</div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Zoom `In` e `Out` via ONVIF</div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Botão `Stop` enviando parada real ao backend</div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">Presets, focus e tours ainda não implementados</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <p>Esta câmera não suporta controles PTZ.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/70 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Configuração Real da Câmera</p>
                  <p className="mt-1 text-sm font-semibold">Edite os parâmetros técnicos e salve no backend</p>
                </div>
                <button
                  type="button"
                  onClick={() => void runConnectionTest()}
                  disabled={testingConnection || configLoading}
                  className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {testingConnection ? 'Testando conexão...' : 'Testar Conexão'}
                </button>
                <button
                  type="button"
                  onClick={() => void discoverEndpoints()}
                  disabled={discoveringEndpoints || configLoading}
                  className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {discoveringEndpoints ? 'Descobrindo...' : 'Descobrir Endpoints'}
                </button>
              </div>

              {configLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Carregando parâmetros da câmera...</div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveSettings();
                  }}
                  className="space-y-5"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Nome da Câmera</label>
                      <input
                        value={form.name}
                        onChange={(event) => updateField('name', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Endereço IP</label>
                      <input
                        value={form.ip}
                        onChange={(event) => updateField('ip', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Porta RTSP</label>
                      <input
                        type="number"
                        min={1}
                        value={form.rtspPort}
                        onChange={(event) => updateField('rtspPort', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Porta ONVIF</label>
                      <input
                        type="number"
                        min={1}
                        value={form.onvifPort}
                        onChange={(event) => updateField('onvifPort', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Usuário</label>
                      <input
                        value={form.username}
                        onChange={(event) => updateField('username', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Senha (deixe em branco para manter)</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => updateField('password', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Caminho RTSP</label>
                      <input
                        value={form.rtspPath}
                        onChange={(event) => updateField('rtspPath', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Caminho ONVIF</label>
                      <input
                        value={form.onvifPath}
                        onChange={(event) => updateField('onvifPath', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Canal</label>
                      <input
                        type="number"
                        min={1}
                        value={form.channel}
                        onChange={(event) => updateField('channel', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Perfil de Stream (subtype)</label>
                      <select
                        value={form.subtype}
                        onChange={(event) => updateField('subtype', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="0">Principal (0)</option>
                        <option value="1">Substream (1)</option>
                        <option value="2">Substream 2 (2)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Token de Perfil ONVIF</label>
                      <input
                        value={form.onvifProfileToken}
                        onChange={(event) => updateField('onvifProfileToken', event.target.value)}
                        className="h-9 w-full rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={form.recordingEnabled}
                          onChange={(event) => updateField('recordingEnabled', event.target.checked)}
                        />
                        Gravação habilitada
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Sensibilidade de movimento (local UI)</label>
                      <Slider value={motionSensitivity} onValueChange={setMotionSensitivity} max={100} className="w-full" />
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={configSaving || configLoading}
                      className="h-9 rounded bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {configSaving ? 'Salvando...' : 'Salvar Configurações'}
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
