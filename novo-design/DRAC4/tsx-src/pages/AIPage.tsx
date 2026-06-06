import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Brain, Camera, RefreshCw, UserRound, Users,
  Play, Square, RotateCw, ScanLine, Rocket, ChevronRight,
  CircleDot, Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getApiBaseUrl } from '@/lib/api-base';
import { useAuthStore } from '@/store/authStore';
import { useVmsDataStore } from '@/store/vmsDataStore';
import { useToast } from '@/hooks/use-toast';

type AiMode = 'motion' | 'face' | 'general';

type AiSettings = {
  id: string;
  enabled: boolean;
  mode: AiMode;
  updatedAt: string;
};

type ProcessorInfo = {
  running?: boolean;
  analysis_type?: string;
  motion_trigger?: string;
  hibernating?: boolean;
};

type Detection = {
  id: string;
  cameraId: string;
  label: string;
  confidence: number;
  at: string;
};

const API_URL = getApiBaseUrl();

const MODES: Array<{ id: AiMode; title: string; description: string; icon: typeof Activity }> = [
  { id: 'motion', title: 'Movimento', description: 'Detecta atividade nas câmeras com baixo consumo.', icon: Activity },
  { id: 'face', title: 'Rosto', description: 'Ativa detecção facial quando esse recurso estiver em uso.', icon: Users },
  { id: 'general', title: 'Pessoa e veículos', description: 'Detecção visual para acompanhamento no vídeo ao vivo.', icon: UserRound },
];

const MODE_LABEL: Record<AiMode, string> = {
  motion: 'Movimento', face: 'Rosto', general: 'Pessoa e veículos',
};

function useApi() {
  const token = useAuthStore((state) => state.accessToken);
  return useMemo(() => axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }), [token]);
}

function modelLabel(info: ProcessorInfo) {
  if (info?.analysis_type === 'face') return 'scrfd_500m';
  if (info?.analysis_type === 'general') return 'yolo26n';
  return 'motion';
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.round(m / 60);
  return `${h}h atrás`;
}

export default function AIPage() {
  const client = useApi();
  const { toast } = useToast();
  const cameras = useVmsDataStore((state) => state.cameras);
  const loadData = useVmsDataStore((state) => state.load);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyCam, setBusyCam] = useState<string | null>(null);
  const [rollingOut, setRollingOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const aiEnabledCameras = cameras.filter((camera) => camera.aiEnabled).length;
  const processors: Record<string, ProcessorInfo> = health?.processors ?? {};
  const runningCount = Object.values(processors).filter((p) => p.running).length;
  const rolloutPercent = cameras.length ? Math.round((aiEnabledCameras / cameras.length) * 100) : 0;

  const refresh = async () => {
    const [settingsRes, healthRes, detRes] = await Promise.all([
      client.get('/ai/settings'),
      client.get('/ai/health').catch(() => ({ data: null })),
      client.get('/ai/detections', { params: { limit: 12 } }).catch(() => ({ data: null })),
    ]);
    setSettings(settingsRes.data);
    setHealth(healthRes.data);
    const items = Array.isArray(detRes.data) ? detRes.data : detRes.data?.items;
    if (Array.isArray(items)) {
      setDetections(items.map((d: any, i: number) => ({
        id: d.id ?? String(i),
        cameraId: d.cameraId ?? d.camera_id ?? '',
        label: d.label ?? d.class ?? d.analysis_type ?? 'Detecção',
        confidence: typeof d.confidence === 'number' ? d.confidence : (d.score ?? 0),
        at: d.at ?? d.createdAt ?? d.timestamp ?? new Date().toISOString(),
      })));
    }
  };

  useEffect(() => {
    void loadData();
    void refresh();
    const t = window.setInterval(() => { void refresh(); }, 8000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async (patch: Partial<AiSettings>) => {
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await client.patch('/ai/settings', patch);
      setSettings(data.settings);
      setMessage('IA sincronizada.');
      await refresh();
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível salvar as configurações de IA.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await client.post('/ai/sync');
      await refresh();
      setMessage('Sincronização concluída.');
    } catch {
      toast({ title: 'Erro', description: 'Falha ao sincronizar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Per-camera processor control: start / stop / restart ──
  const controlCamera = async (cameraId: string, action: 'start' | 'stop' | 'restart') => {
    setBusyCam(cameraId);
    const labels = { start: 'iniciada', stop: 'parada', restart: 'reiniciada' };
    try {
      // Preferred: dedicated processor endpoint
      await client.post(`/ai/processors/${cameraId}/${action}`);
    } catch {
      // Fallback: toggle aiEnabled via camera patch
      try {
        await client.patch(`/cameras/${cameraId}`, { aiEnabled: action !== 'stop' });
      } catch {
        setBusyCam(null);
        toast({ title: 'Erro', description: `Não foi possível ${action === 'stop' ? 'parar' : action === 'start' ? 'iniciar' : 'reiniciar'} a análise.`, variant: 'destructive' });
        return;
      }
    }
    await Promise.all([loadData(), refresh()]);
    setBusyCam(null);
    toast({ title: 'IA atualizada', description: `Análise ${labels[action]} para a câmera.` });
  };

  const toggleCamera = async (cameraId: string, aiEnabled: boolean) => {
    setBusyCam(cameraId);
    try {
      await client.patch(`/cameras/${cameraId}`, { aiEnabled });
      await Promise.all([loadData(), refresh()]);
    } finally {
      setBusyCam(null);
    }
  };

  // ── Gradual rollout: enable AI on next batch of cameras ──
  const rolloutNext = async (batch: number) => {
    const targets = cameras.filter((c) => !c.aiEnabled).slice(0, batch);
    if (!targets.length) return;
    setRollingOut(true);
    try {
      await Promise.all(targets.map((c) => client.patch(`/cameras/${c.id}`, { aiEnabled: true })));
      await Promise.all([loadData(), refresh()]);
      toast({ title: 'Rollout aplicado', description: `IA ativada em +${targets.length} câmera(s).` });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao aplicar rollout.', variant: 'destructive' });
    } finally {
      setRollingOut(false);
    }
  };

  const pauseRollout = async () => {
    const targets = cameras.filter((c) => c.aiEnabled);
    if (!targets.length) return;
    setRollingOut(true);
    try {
      await Promise.all(targets.map((c) => client.patch(`/cameras/${c.id}`, { aiEnabled: false })));
      await Promise.all([loadData(), refresh()]);
      toast({ title: 'Rollout pausado', description: 'IA desativada em todas as câmeras.' });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao pausar rollout.', variant: 'destructive' });
    } finally {
      setRollingOut(false);
    }
  };

  return (
    <div className="min-h-full bg-background p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        {/* ── Header ── */}
        <header className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <Brain className="h-3.5 w-3.5" /> IA
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Inteligência de vídeo</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Controle a análise por câmera, acompanhe detecções em tempo real e faça o rollout gradual sem afetar live, gravação e reprodução.
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </header>

        {message && <div className="rounded-lg border border-[hsl(152_46%_44%_/_0.25)] bg-[hsl(152_46%_44%_/_0.1)] px-4 py-3 text-sm text-[hsl(152_46%_60%)]">{message}</div>}
        {settings && !settings.enabled && (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            IA desligada neste servidor. O sistema continua operando normalmente com câmeras, WebRTC, gravação e reprodução.
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Estado da IA', value: settings?.enabled ? 'Ligada' : 'Desligada', icon: Brain, tone: settings?.enabled ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground' },
            { label: 'Modo ativo', value: settings ? MODE_LABEL[settings.mode] : '—', icon: ScanLine, tone: 'text-foreground' },
            { label: 'Processadores ativos', value: `${runningCount}/${Object.keys(processors).length || 0}`, icon: Activity, tone: 'text-foreground' },
            { label: 'Cobertura (rollout)', value: `${rolloutPercent}%`, icon: Rocket, tone: 'text-foreground' },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${kpi.tone}`}>{kpi.value}</div>
              </div>
            );
          })}
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* ── Mode + global toggle ── */}
          <Card className="border-card-border bg-card">
            <CardHeader>
              <CardTitle>Modo de análise</CardTitle>
              <CardDescription>Comportamento aplicado quando a IA está ligada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-4">
                <div>
                  <div className="text-sm font-semibold">IA do sistema</div>
                  <div className="text-xs text-muted-foreground">Estado atual: {settings?.enabled ? 'ligada' : 'desligada'}</div>
                </div>
                <button
                  onClick={() => saveSettings({ enabled: !settings?.enabled })}
                  disabled={!settings || saving}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${settings?.enabled ? 'bg-[hsl(152_46%_44%)] text-white' : 'border border-border bg-background'}`}
                >
                  {settings?.enabled ? 'Ligada' : 'Desligada'}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {MODES.map((mode) => {
                  const Icon = mode.icon;
                  const active = settings?.mode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => saveSettings({ mode: mode.id })}
                      disabled={saving}
                      className={`rounded-lg border p-4 text-left transition ${active ? 'border-[hsl(var(--primary)_/_0.4)] bg-[hsl(var(--primary)_/_0.08)]' : 'border-border bg-background/60 hover:bg-accent'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Icon className={`h-5 w-5 ${active ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground'}`} />
                        <Badge variant="outline" className="text-[9px]">{active ? 'Ativo' : 'Disponível'}</Badge>
                      </div>
                      <div className="mt-3 text-sm font-semibold">{mode.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mode.description}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Detections feed ── */}
          <Card className="border-card-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Detecções recentes</CardTitle>
                  <CardDescription>Atualização automática a cada 8s.</CardDescription>
                </div>
                <CircleDot className="h-3.5 w-3.5 text-[hsl(var(--primary))] animate-pulse" />
              </div>
            </CardHeader>
            <CardContent>
              {detections.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <ScanLine className="h-7 w-7 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Sem detecções recentes.</p>
                  <p className="text-[10px] text-muted-foreground/70">As detecções aparecem aqui quando a IA está ativa.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {detections.map((d) => {
                    const cam = cameras.find((c) => c.id === d.cameraId);
                    return (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2">
                        <div className="w-1.5 h-8 rounded-full bg-[hsl(var(--primary)_/_0.5)] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium truncate">{d.label}</span>
                            {d.confidence > 0 && (
                              <span className="font-mono text-[10px] text-muted-foreground">{Math.round(d.confidence * 100)}%</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{cam?.name ?? d.cameraId || 'Câmera'}</div>
                        </div>
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground shrink-0">
                          <Clock className="h-3 w-3" /> {relTime(d.at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Rollout ── */}
        <Card className="border-card-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-[hsl(var(--primary))]" /> Rollout gradual</CardTitle>
            <CardDescription>Ative a IA por etapas para medir o impacto de carga antes de cobrir toda a operação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{aiEnabledCameras} de {cameras.length} câmeras com IA</span>
                <span className="font-mono font-semibold text-[hsl(var(--primary))]">{rolloutPercent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-border/70">
                <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-700" style={{ width: `${rolloutPercent}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => rolloutNext(1)} disabled={rollingOut || aiEnabledCameras >= cameras.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:opacity-50">
                <ChevronRight className="h-3.5 w-3.5" /> +1 câmera
              </button>
              <button onClick={() => rolloutNext(5)} disabled={rollingOut || aiEnabledCameras >= cameras.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:opacity-50">
                <ChevronRight className="h-3.5 w-3.5" /> +5 câmeras
              </button>
              <button onClick={() => rolloutNext(cameras.length)} disabled={rollingOut || aiEnabledCameras >= cameras.length}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                <Rocket className="h-3.5 w-3.5" /> Ativar todas
              </button>
              <button onClick={pauseRollout} disabled={rollingOut || aiEnabledCameras === 0}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--destructive)_/_0.3)] bg-background px-3 py-2 text-xs font-medium text-[hsl(var(--destructive))] transition hover:bg-[hsl(var(--destructive)_/_0.08)] disabled:opacity-50">
                <Square className="h-3.5 w-3.5" /> Pausar tudo
              </button>
            </div>
          </CardContent>
        </Card>

        {/* ── Per-camera control ── */}
        <Card className="border-card-border bg-card">
          <CardHeader>
            <CardTitle>Controle por câmera</CardTitle>
            <CardDescription>Inicie, pare ou reinicie a análise individualmente. O estado do processador é exibido em tempo real.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {cameras.map((camera) => {
              const proc = processors[camera.id];
              const running = proc?.running ?? false;
              const busy = busyCam === camera.id;
              const state = !camera.aiEnabled ? 'fora' : running ? 'ativa' : 'parada';
              const stateTone =
                state === 'ativa' ? 'text-[hsl(152_46%_55%)]'
                : state === 'parada' ? 'text-[hsl(38_58%_60%)]'
                : 'text-muted-foreground';
              return (
                <div key={camera.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                  <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{camera.name}</p>
                      {camera.aiEnabled && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${stateTone}`}>
                          <CircleDot className="h-2.5 w-2.5" /> {state}
                          {proc?.analysis_type && <span className="font-mono text-muted-foreground/70">· {modelLabel(proc)}</span>}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{camera.zone} • {camera.isOnline ? 'online' : 'offline'}</p>
                  </div>

                  {camera.aiEnabled ? (
                    <div className="flex items-center gap-1">
                      <button title="Iniciar" disabled={busy || running} onClick={() => controlCamera(camera.id, 'start')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-[hsl(152_46%_55%)] hover:border-[hsl(152_46%_44%_/_0.4)] disabled:opacity-40">
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button title="Parar" disabled={busy || !running} onClick={() => controlCamera(camera.id, 'stop')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive)_/_0.4)] disabled:opacity-40">
                        <Square className="h-3.5 w-3.5" />
                      </button>
                      <button title="Reiniciar" disabled={busy} onClick={() => controlCamera(camera.id, 'restart')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-40">
                        <RotateCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                      </button>
                      <button title="Remover da análise" disabled={busy} onClick={() => toggleCamera(camera.id, false)}
                        className="ml-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent disabled:opacity-40">
                        Remover
                      </button>
                    </div>
                  ) : (
                    <button disabled={busy} onClick={() => toggleCamera(camera.id, true)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                      Adicionar à IA
                    </button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
