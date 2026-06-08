import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  Camera,
  CheckCircle2,
  Cpu,
  Eye,
  Gauge,
  Layers3,
  Loader2,
  Network,
  RefreshCcw,
  RotateCcw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  ZapOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiBaseUrl } from '@/lib/api-base';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useVmsDataStore } from '@/store/vmsDataStore';

type AiMode = 'motion' | 'face' | 'general';
type Severity = 'info' | 'warning' | 'critical';

type Recommendation = {
  severity: Severity;
  code: string;
  message: string;
};

type AiCamera = {
  camera: {
    id: string;
    name: string;
    ip: string;
    online: boolean;
    status: string;
    site?: string | null;
    area?: string | null;
    group?: string | null;
    lastSeenAt?: string | null;
  };
  participation: {
    aiEnabled: boolean;
    allowedByPolicy: boolean;
    expectedToRun: boolean;
    blockedReason?: string | null;
  };
  profiles: {
    recording: { channel: number; subtype: number; codec?: string | null; width?: number | null; height?: number | null; fps?: number | null; mode?: string; enabled: boolean };
    live: { channel: number; subtype: number; protocol: string; codec?: string | null; width?: number | null; height?: number | null; fps?: number | null };
    analytics: { channel: number; subtype: number; separatedFromLive: boolean; expectedSource: string; audioExpected: boolean };
  };
  source: {
    kind: string;
    usesMediaMtx: boolean;
    directCamera: boolean;
    audioRequested: boolean;
    analyticsRtspUrl?: string | null;
    codec?: string | null;
    transcodedForAi: boolean;
    fallbackReason?: string | null;
  };
  runtime: {
    running: boolean;
    hibernating: boolean;
    analysisType?: string | null;
    advancedAnalysisType?: string | null;
    processFpsTarget?: number | null;
    advancedFpsTarget?: number | null;
    motionTrigger?: string | null;
    lastSeen?: number | null;
    lastError?: string | null;
  };
  stream: {
    codec?: string | null;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    captureFps?: number | null;
    inferenceFps?: number | null;
    frameAgeLastMs?: number | null;
    frameAgeAvgMs?: number | null;
    latestFrameOnly: boolean;
    bufferSize: number;
    queueSize: number;
    droppedFrames: number;
    captureFramesEnqueued: number;
    captureFramesDropped: number;
    captureDropRatio: number;
  };
  performance: {
    processedFrames: number;
    processFpsReal?: number | null;
    advancedInferRuns: number;
    advancedInferErrors: number;
    inferLastMs?: number | null;
    inferAvgMs?: number | null;
    inferP95Ms?: number | null;
    poolBusyDrops: number;
    overlayPayloadFrames: number;
    overlayEmptyFrames: number;
    overlayPayloadRatio?: number | null;
  };
  liveView: {
    activeSessions: number;
    qosMode?: string | null;
    selectedSessions: number;
    gridSessions: number;
    qosLiveEnabled: boolean;
    adaptiveEnabledForCamera: boolean;
    cpuPercent?: number | null;
    dropRatio?: number | null;
  };
  health: {
    state: string;
    severity: Severity;
    label: string;
  };
  recommendations: Recommendation[];
};

type AiIntelligence = {
  generatedAt: string;
  status: string;
  service: {
    online: boolean;
    healthStatus: string;
    activeProcessors: string[];
    lastError?: string | null;
  };
  commercial: {
    aiAdvancedAllowed: boolean;
  };
  settings: {
    enabled: boolean;
    mode: AiMode;
    modeLabel: string;
    updatedAt: string;
  };
  runtimePolicy: Record<string, unknown>;
  model: {
    mode: string;
    profile: {
      model?: string | null;
      runtime?: string | null;
      precision?: string | null;
      analysisWidth?: number | null;
      analysisHeight?: number | null;
      imgsz?: number | null;
      detectionFps?: number | null;
      classes?: string[];
      classIds?: number[];
      tracker?: string | null;
      overlayMode?: string | null;
      overlayTtlMs?: number | null;
      lostTtlMs?: number | null;
    };
    registry: {
      status?: string | null;
      lastError?: string | null;
      detectors: Array<Record<string, unknown>>;
    };
    threading?: Record<string, unknown> | null;
  };
  summary: {
    totalCameras: number;
    onlineCameras: number;
    aiEnabledCameras: number;
    allowedByPolicyCameras: number;
    expectedProcessors: number;
    runningProcessors: number;
    directCameraSources: number;
    mediaMtxSources: number;
    hibernatingProcessors: number;
    activeLiveSessions: number;
    avgCaptureFps?: number | null;
    avgInferenceFps?: number | null;
    avgFrameAgeMs?: number | null;
    avgInferLatencyMs?: number | null;
    inferP95Ms?: number | null;
    poolBusyDrops: number;
    advancedInferErrors: number;
    captureDroppedFrames: number;
  };
  recommendations: Recommendation[];
  cameras: AiCamera[];
};

type CameraDetail = {
  generatedAt: string;
  camera: AiCamera | null;
  latestDetections?: {
    status: string;
    detections?: Array<Record<string, unknown>>;
  };
};

const API_URL = getApiBaseUrl();

const MODES: Array<{ id: AiMode; title: string; description: string; icon: typeof Activity }> = [
  { id: 'motion', title: 'Movimento', description: 'Operação leve para eventos simples e baixo consumo.', icon: Activity },
  { id: 'face', title: 'Rosto', description: 'Detecção facial quando o perfil estiver habilitado no ambiente.', icon: Eye },
  { id: 'general', title: 'Pessoas e veículos', description: 'Pessoa, bicicleta, carro e moto com overlay na live.', icon: Layers3 },
];

function useApi() {
  const token = useAuthStore((state) => state.accessToken);
  return useMemo(() => axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }), [token]);
}

function formatNumber(value?: number | null, digits = 1) {
  if (!Number.isFinite(value as number)) return '—';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatInteger(value?: number | null) {
  if (!Number.isFinite(value as number)) return '—';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatFps(value?: number | null) {
  if (!Number.isFinite(value as number)) return '—';
  return `${formatNumber(value, 1)} fps`;
}

function formatMs(value?: number | null) {
  if (!Number.isFinite(value as number)) return '—';
  return `${formatNumber(value, 0)} ms`;
}

function formatResolution(width?: number | null, height?: number | null) {
  if (!width || !height) return '—';
  return `${width}x${height}`;
}

function severityClasses(severity: Severity) {
  if (severity === 'critical') return 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))]';
  if (severity === 'warning') return 'border-[hsl(var(--status-warning)_/_0.3)] bg-[hsl(var(--status-warning)_/_0.1)] text-[hsl(var(--status-warning))]';
  return 'border-border bg-muted/50 text-muted-foreground';
}

function statusBadge(status: string) {
  if (status === 'ok') return { label: 'Operacional', className: 'border-[hsl(var(--status-online)_/_0.3)] bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))]' };
  if (status === 'disabled') return { label: 'Desligada', className: 'border-border bg-background text-muted-foreground' };
  if (status === 'restricted') return { label: 'Restrita', className: 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))]' };
  if (status === 'offline') return { label: 'Serviço offline', className: 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))]' };
  if (status === 'critical') return { label: 'Crítica', className: 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))]' };
  return { label: 'Atenção', className: 'border-[hsl(var(--status-warning)_/_0.3)] bg-[hsl(var(--status-warning)_/_0.1)] text-[hsl(var(--status-warning))]' };
}

function healthBadge(camera: AiCamera) {
  if (!camera.participation.aiEnabled) return 'border-border bg-background text-muted-foreground';
  if (camera.health.severity === 'critical') return 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))]';
  if (camera.health.severity === 'warning') return 'border-[hsl(var(--status-warning)_/_0.3)] bg-[hsl(var(--status-warning)_/_0.1)] text-[hsl(var(--status-warning))]';
  if (camera.health.state === 'disabled') return 'border-border bg-background text-muted-foreground';
  return 'border-[hsl(var(--status-online)_/_0.3)] bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))]';
}

function modelRuntimeLabel(intelligence: AiIntelligence | null) {
  const profile = intelligence?.model?.profile;
  if (!profile) return '—';
  return [profile.model, profile.runtime, profile.precision].filter(Boolean).join(' / ') || '—';
}

function asText(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function RecommendationList({ items }: { items: Recommendation[] }) {
  return (
    <div className="grid gap-2">
      {items.slice(0, 8).map((item) => (
        <div key={`${item.code}-${item.message}`} className={cn('rounded-lg border px-3 py-2 text-sm', severityClasses(item.severity))}>
          <div className="flex items-start gap-2">
            {item.severity === 'critical' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : item.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <ZapOff className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{item.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CameraSourceLine({ camera }: { camera: AiCamera }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>rec {camera.profiles.recording.channel}/{camera.profiles.recording.subtype}</span>
      <span>•</span>
      <span>live {camera.profiles.live.channel}/{camera.profiles.live.subtype}</span>
      <span>•</span>
      <span>IA {camera.profiles.analytics.channel}/{camera.profiles.analytics.subtype}</span>
      <span>•</span>
      <span>{camera.source.usesMediaMtx ? 'via MediaMTX' : camera.runtime.running ? 'direto da câmera' : 'aguardando processador'}</span>
    </div>
  );
}

export default function AIPage() {
  const client = useApi();
  const reloadStore = useVmsDataStore((state) => state.load);
  const [tab, setTab] = useState('overview');
  const [intelligence, setIntelligence] = useState<AiIntelligence | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [detail, setDetail] = useState<CameraDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIntelligence = useCallback(async () => {
    setError(null);
    const { data } = await client.get<AiIntelligence>('/ai/intelligence');
    setIntelligence(data);
    setSelectedCameraId((current) => current || data.cameras[0]?.camera.id || '');
    return data;
  }, [client]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadIntelligence();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar inteligência.');
    } finally {
      setLoading(false);
    }
  }, [loadIntelligence]);

  const loadDetail = useCallback(async (cameraId: string) => {
    if (!cameraId) return;
    setDetailLoading(true);
    try {
      const { data } = await client.get<CameraDetail>(`/ai/intelligence/cameras/${cameraId}`);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reloadStore();
    void refresh();
  }, [refresh, reloadStore]);

  useEffect(() => {
    if (tab === 'debug' && selectedCameraId) void loadDetail(selectedCameraId);
  }, [tab, selectedCameraId, loadDetail]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await action();
      await loadIntelligence();
      setMessage(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ação não concluída.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = (patch: Partial<{ enabled: boolean; mode: AiMode }>) => runAction(
    async () => {
      await client.patch('/ai/settings', patch);
    },
    'Configuração aplicada e IA sincronizada.',
  );

  const syncNow = () => runAction(
    async () => {
      await client.post('/ai/sync');
    },
    'Sincronização concluída.',
  );

  const toggleCamera = (cameraId: string, aiEnabled: boolean) => runAction(
    async () => {
      await client.patch(`/cameras/${cameraId}`, { aiEnabled });
      await reloadStore();
    },
    aiEnabled ? 'Câmera incluída na IA.' : 'Câmera removida da IA.',
  );

  const restartCamera = (cameraId: string) => runAction(
    async () => {
      await client.post(`/ai/intelligence/cameras/${cameraId}/restart`);
      if (tab === 'debug') await loadDetail(cameraId);
    },
    'Processador da câmera reiniciado.',
  );

  const badge = statusBadge(intelligence?.status ?? 'offline');
  const selectedCamera = intelligence?.cameras.find((camera) => camera.camera.id === selectedCameraId) ?? null;
  const overlayPercent = intelligence?.cameras.length
    ? intelligence.cameras.reduce((sum, camera) => sum + Number(camera.performance.overlayPayloadRatio ?? 0), 0) / intelligence.cameras.length * 100
    : 0;

  return (
    <div className="min-h-full bg-background p-4 md:p-6">
      <div className="mx-auto grid max-w-[1500px] gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-border bg-card/90 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <p className="text-xs font-semibold uppercase text-muted-foreground">Inteligência DRAC</p>
              <Badge variant="outline" className={cn('ml-0 md:ml-2', badge.className)}>{badge.label}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Operação de IA</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Saúde, origem dos streams, modelo, gargalos e debug do overlay em uma única tela operacional.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading || saving}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
              Atualizar
            </Button>
            <Button onClick={syncNow} disabled={saving || loading}>
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Sincronizar
            </Button>
          </div>
        </header>

        {message ? <div className="rounded-lg border border-[hsl(var(--status-online)_/_0.25)] bg-[hsl(var(--status-online)_/_0.1)] px-4 py-3 text-sm text-[hsl(var(--status-online))]">{message}</div> : null}
        {error ? <div className="rounded-lg border border-[hsl(var(--destructive)_/_0.25)] bg-[hsl(var(--destructive)_/_0.1)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">{error}</div> : null}
        {intelligence?.model?.registry?.lastError ? (
          <div className="rounded-lg border border-[hsl(var(--destructive)_/_0.25)] bg-[hsl(var(--destructive)_/_0.1)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
            {String(intelligence.model.registry.lastError)}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={Camera} label="Câmeras IA" value={`${intelligence?.summary.runningProcessors ?? 0}/${intelligence?.summary.expectedProcessors ?? 0}`} detail={`${intelligence?.summary.aiEnabledCameras ?? 0} habilitadas`} />
          <Metric icon={Network} label="Fonte direta" value={`${intelligence?.summary.directCameraSources ?? 0}`} detail={`${intelligence?.summary.mediaMtxSources ?? 0} via fallback`} />
          <Metric icon={Gauge} label="Captura média" value={formatFps(intelligence?.summary.avgCaptureFps)} detail={`inferência ${formatFps(intelligence?.summary.avgInferenceFps)}`} />
          <Metric icon={Cpu} label="Latência IA" value={formatMs(intelligence?.summary.avgInferLatencyMs)} detail={`p95 ${formatMs(intelligence?.summary.inferP95Ms)}`} />
          <Metric icon={Activity} label="Frame age" value={formatMs(intelligence?.summary.avgFrameAgeMs)} detail={`${formatInteger(intelligence?.summary.captureDroppedFrames)} frames descartados`} />
          <Metric icon={AlertTriangle} label="Drops críticos" value={String((intelligence?.summary.poolBusyDrops ?? 0) + (intelligence?.summary.advancedInferErrors ?? 0))} detail="pool + erros inferência" />
        </section>

        <Tabs value={tab} onValueChange={setTab} className="grid gap-4">
          <div className="overflow-x-auto">
            <TabsList className="h-10 min-w-max">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="cameras">Câmeras</TabsTrigger>
              <TabsTrigger value="model">Modelo e hardware</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Controle operacional</CardTitle>
                <CardDescription>Estado global, modo ativo e sincronização com os processadores.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/60 p-4">
                  <div>
                    <p className="text-sm font-semibold">IA do sistema</p>
                    <p className="text-xs text-muted-foreground">
                      {intelligence?.settings.enabled ? 'Processadores podem iniciar conforme a política das câmeras.' : 'IA desligada sem afetar live e gravação.'}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(intelligence?.settings.enabled)}
                    disabled={!intelligence || saving}
                    onCheckedChange={(checked) => void saveSettings({ enabled: checked })}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {MODES.map((mode) => {
                    const Icon = mode.icon;
                    const active = intelligence?.settings.mode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => void saveSettings({ mode: mode.id })}
                        disabled={saving || !intelligence}
                        className={cn(
                          'rounded-lg border p-4 text-left transition',
                          active ? 'border-primary/50 bg-primary/10' : 'border-border bg-background/60 hover:bg-accent',
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Icon className="h-5 w-5 text-primary" />
                          <Badge variant="outline">{active ? 'Ativo' : 'Pronto'}</Badge>
                        </div>
                        <p className="mt-3 text-sm font-semibold">{mode.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mode.description}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background/60 p-4">
                    <p className="text-xs text-muted-foreground">Modelo ativo</p>
                    <p className="mt-1 text-sm font-semibold">{modelRuntimeLabel(intelligence)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-4">
                    <p className="text-xs text-muted-foreground">Overlay útil</p>
                    <p className="mt-1 text-sm font-semibold">{formatNumber(overlayPercent, 0)}%</p>
                    <Progress value={Math.max(0, Math.min(100, overlayPercent))} className="mt-3 h-1.5" />
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-4">
                    <p className="text-xs text-muted-foreground">Live sessions</p>
                    <p className="mt-1 text-sm font-semibold">{intelligence?.summary.activeLiveSessions ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Recomendações</CardTitle>
                <CardDescription>Prioridades automáticas sem aumentar carga de CPU.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecommendationList items={intelligence?.recommendations ?? [{ severity: 'info', code: 'loading', message: 'Carregando diagnóstico.' }]} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cameras" className="grid gap-4">
            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Câmeras analisadas</CardTitle>
                <CardDescription>Participação, origem do analytics, FPS real, latência e riscos por câmera.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {(intelligence?.cameras ?? []).map((camera) => (
                  <div key={camera.camera.id} className="grid gap-3 rounded-lg border border-border bg-background/60 p-3 xl:grid-cols-[minmax(220px,1.1fr)_minmax(320px,1.4fr)_minmax(260px,1fr)_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        <p className="truncate text-sm font-semibold">{camera.camera.name}</p>
                        <Badge variant="outline" className={healthBadge(camera)}>{camera.health.label}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{camera.camera.ip} • {camera.camera.area ?? camera.camera.site ?? 'Sem área'}</p>
                      <CameraSourceLine camera={camera} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">captura</p>
                        <p className="text-sm font-semibold">{formatFps(camera.stream.captureFps)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">inferência</p>
                        <p className="text-sm font-semibold">{formatFps(camera.stream.inferenceFps)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">idade</p>
                        <p className="text-sm font-semibold">{formatMs(camera.stream.frameAgeAvgMs)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">resolução IA</p>
                        <p className="text-sm font-semibold">{formatResolution(camera.stream.width, camera.stream.height)}</p>
                      </div>
                    </div>

                    <div className="grid gap-1 text-xs text-muted-foreground">
                      <span>codec: <strong className="text-foreground">{camera.source.codec?.toUpperCase() ?? '—'}</strong></span>
                      <span>latência média: <strong className="text-foreground">{formatMs(camera.performance.inferAvgMs)}</strong></span>
                      <span>pool drops: <strong className="text-foreground">{camera.performance.poolBusyDrops}</strong> • erros: <strong className="text-foreground">{camera.performance.advancedInferErrors}</strong></span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        setSelectedCameraId(camera.camera.id);
                        setTab('debug');
                      }}>
                        Debug
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void restartCamera(camera.camera.id)} disabled={saving || !camera.participation.aiEnabled}>
                        Reiniciar
                      </Button>
                      <Switch
                        checked={camera.participation.aiEnabled}
                        disabled={saving}
                        onCheckedChange={(checked) => void toggleCamera(camera.camera.id, checked)}
                      />
                    </div>

                    {camera.recommendations.some((item) => item.code !== 'healthy') ? (
                      <div className="xl:col-span-4">
                        <RecommendationList items={camera.recommendations.filter((item) => item.code !== 'healthy').slice(0, 2)} />
                      </div>
                    ) : null}
                  </div>
                ))}
                {!intelligence?.cameras?.length ? (
                  <div className="rounded-lg border border-border bg-background/60 p-6 text-sm text-muted-foreground">Nenhuma câmera acessível para IA.</div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="model" className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Perfil ativo</CardTitle>
                <CardDescription>Parâmetros reais expostos pelo serviço de IA.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  ['Modelo', intelligence?.model.profile.model],
                  ['Runtime', intelligence?.model.profile.runtime],
                  ['Precisão', intelligence?.model.profile.precision],
                  ['Análise', `${formatResolution(intelligence?.model.profile.analysisWidth, intelligence?.model.profile.analysisHeight)} • input ${intelligence?.model.profile.imgsz ?? '—'}`],
                  ['FPS alvo', intelligence?.model.profile.detectionFps],
                  ['Tracker', intelligence?.model.profile.tracker],
                  ['Overlay', `${intelligence?.model.profile.overlayMode ?? '—'} • TTL ${intelligence?.model.profile.overlayTtlMs ?? '—'} ms`],
                  ['Lost TTL', intelligence?.model.profile.lostTtlMs ? `${intelligence.model.profile.lostTtlMs} ms` : null],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <strong className="text-right font-semibold">{asText(value)}</strong>
                  </div>
                ))}
                <div className="rounded-lg border border-border bg-background/60 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Classes</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(intelligence?.model.profile.classes ?? []).map((name, index) => (
                      <Badge key={`${name}-${index}`} variant="outline">{name}</Badge>
                    ))}
                    {!(intelligence?.model.profile.classes ?? []).length ? <span className="text-xs text-muted-foreground">—</span> : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Hardware e registry</CardTitle>
                <CardDescription>Estado dos detectores carregados e política de CPU.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-muted-foreground" /> Threads</div>
                    <p className="mt-2 text-xs text-muted-foreground">override: {asText(intelligence?.runtimePolicy.inferenceThreadsOverride)} • workers: {asText(intelligence?.runtimePolicy.inferenceWorkerCount)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">reserva CPU: {asText(intelligence?.runtimePolicy.cpuReservePercent)}%</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Política</div>
                    <p className="mt-2 text-xs text-muted-foreground">auto start: {asText(intelligence?.runtimePolicy.autoStart)} • latest-frame-only: {asText(intelligence?.runtimePolicy.latestFrameOnly)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">origem: {asText(intelligence?.runtimePolicy.analyticsSource)}</p>
                  </div>
                </div>

                {(intelligence?.model.registry.detectors ?? []).map((detector, index) => (
                  <div key={`${detector.name}-${index}`} className="rounded-lg border border-border bg-background/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{asText(detector.name)}</p>
                      <Badge variant="outline">{asText(detector.openvinoDevice ?? detector.runtime)}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <span>modelo: <strong className="text-foreground">{asText(detector.model)}</strong></span>
                      <span>precisão: <strong className="text-foreground">{asText(detector.activePrecision ?? detector.requestedPrecision)}</strong></span>
                      <span>input ativo: <strong className="text-foreground">{asText(detector.selectedInputSize)}</strong></span>
                      <span>pool drops: <strong className="text-foreground">{asText(detector.poolBusyDrops)}</strong></span>
                      <span>threads: <strong className="text-foreground">{asText(detector.inferenceThreads)}</strong></span>
                      <span>workers: <strong className="text-foreground">{asText(detector.workers)}</strong></span>
                    </div>
                  </div>
                ))}
                {!(intelligence?.model.registry.detectors ?? []).length ? (
                  <div className="rounded-lg border border-border bg-background/60 p-6 text-sm text-muted-foreground">
                    Nenhum detector avançado carregado no momento. Isso é normal quando o modo ativo é apenas movimento ou a IA está desligada.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debug" className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Debug por câmera</CardTitle>
                <CardDescription>Snapshot operacional para validar overlay, fonte e idade dos frames.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Select value={selectedCameraId} onValueChange={(value) => {
                  setSelectedCameraId(value);
                  void loadDetail(value);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar câmera" />
                  </SelectTrigger>
                  <SelectContent>
                    {(intelligence?.cameras ?? []).map((camera) => (
                      <SelectItem key={camera.camera.id} value={camera.camera.id}>{camera.camera.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCamera ? (
                  <div className="grid gap-3">
                    <div className="rounded-lg border border-border bg-background/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{selectedCamera.camera.name}</p>
                          <p className="text-xs text-muted-foreground">{selectedCamera.source.analyticsRtspUrl ?? 'URL de analytics disponível quando o processador estiver ativo.'}</p>
                        </div>
                        <Badge variant="outline" className={healthBadge(selectedCamera)}>{selectedCamera.health.label}</Badge>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm">
                      {[
                        ['Fonte', selectedCamera.source.usesMediaMtx ? 'MediaMTX fallback' : selectedCamera.source.kind],
                        ['Codec recebido', selectedCamera.source.codec?.toUpperCase()],
                        ['Stream IA', formatResolution(selectedCamera.stream.width, selectedCamera.stream.height)],
                        ['Captura', formatFps(selectedCamera.stream.captureFps)],
                        ['Inferência', formatFps(selectedCamera.stream.inferenceFps)],
                        ['Frame age médio', formatMs(selectedCamera.stream.frameAgeAvgMs)],
                        ['Latest-frame-only', selectedCamera.stream.latestFrameOnly ? 'sim' : 'não'],
                        ['Queue/buffer', `${selectedCamera.stream.queueSize}/${selectedCamera.stream.bufferSize}`],
                        ['Overlay com payload', `${formatInteger(selectedCamera.performance.overlayPayloadFrames)} frames`],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/60 px-3 py-2">
                          <span className="text-muted-foreground">{label}</span>
                          <strong className="text-right font-semibold">{asText(value)}</strong>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" onClick={() => void restartCamera(selectedCamera.camera.id)} disabled={saving}>
                      <RotateCcw />
                      Reiniciar processador
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-background/60 p-6 text-sm text-muted-foreground">Selecione uma câmera.</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card/90">
              <CardHeader className="pb-4">
                <CardTitle>Detecções recentes</CardTitle>
                <CardDescription>Payload vivo retornado pelo serviço, sem fallback de evento.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {detailLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando snapshot...
                  </div>
                ) : null}
                {(detail?.latestDetections?.detections ?? []).slice(0, 12).map((detection, index) => (
                  <div key={`${String(detection.trackId ?? detection.id ?? index)}-${index}`} className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{asText(detection.label)}</Badge>
                        <span className="text-xs text-muted-foreground">track {asText(detection.trackId)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">conf {formatNumber(Number(detection.confidence), 2)}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                      <span>bbox: <strong className="text-foreground">{Array.isArray(detection.bbox) ? detection.bbox.join(', ') : '—'}</strong></span>
                      <span>frame: <strong className="text-foreground">{asText(detection.frameWidth)}x{asText(detection.frameHeight)}</strong></span>
                      <span>overlay: <strong className="text-foreground">{asText(detection.overlayMode)}</strong></span>
                      <span>idade: <strong className="text-foreground">{asText(detection.ageMs ?? detection.snapshotAgeMs)} ms</strong></span>
                    </div>
                  </div>
                ))}
                {!detailLoading && !(detail?.latestDetections?.detections ?? []).length ? (
                  <div className="rounded-lg border border-border bg-background/60 p-6 text-sm text-muted-foreground">
                    Nenhuma detecção viva dentro da janela atual. Se houver pessoa/veículo visível, confira FPS de captura, codec do analytics e se o processador está ativo.
                  </div>
                ) : null}
                <div className="rounded-lg border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    Recomendações desta câmera
                  </div>
                  <div className="mt-3">
                    <RecommendationList items={detail?.camera?.recommendations ?? selectedCamera?.recommendations ?? []} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {!intelligence && !loading ? (
          <div className="rounded-lg border border-border bg-card/90 p-8 text-center">
            <ZapOff className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">Inteligência indisponível</p>
            <p className="mt-1 text-sm text-muted-foreground">A API não retornou o status da IA. Verifique o serviço e tente atualizar.</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Server className="h-3.5 w-3.5" />
          <span>Atualizado em {intelligence?.generatedAt ? new Date(intelligence.generatedAt).toLocaleString('pt-BR') : '—'}</span>
          <span>•</span>
          <span>Serviço {intelligence?.service.online ? 'online' : 'offline'}</span>
        </div>
      </div>
    </div>
  );
}
