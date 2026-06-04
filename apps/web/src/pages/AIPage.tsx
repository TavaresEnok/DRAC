import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Brain, Camera, RefreshCw, UserRound, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getApiBaseUrl } from '@/lib/api-base';
import { useAuthStore } from '@/store/authStore';
import { useVmsDataStore } from '@/store/vmsDataStore';

type AiMode = 'motion' | 'face' | 'general';

type AiSettings = {
  id: string;
  enabled: boolean;
  mode: AiMode;
  updatedAt: string;
};

const API_URL = getApiBaseUrl();

const MODES: Array<{ id: AiMode; title: string; description: string; icon: typeof Activity }> = [
  { id: 'motion', title: 'Movimento', description: 'Detecta atividade nas câmeras com baixo consumo.', icon: Activity },
  { id: 'face', title: 'Rosto', description: 'Ativa detecção facial quando esse recurso estiver em uso.', icon: Users },
  { id: 'general', title: 'Pessoa e veículos', description: 'Ativa detecção visual para acompanhamento no vídeo ao vivo.', icon: UserRound },
];

function useApi() {
  const token = useAuthStore((state) => state.accessToken);
  return useMemo(() => axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }), [token]);
}

function modelLabel(info: any) {
  if (info?.analysis_type === 'face') return 'scrfd_500m';
  if (info?.analysis_type === 'general') return 'yolo26n';
  return 'motion';
}

export default function AIPage() {
  const client = useApi();
  const cameras = useVmsDataStore((state) => state.cameras);
  const loadData = useVmsDataStore((state) => state.load);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const aiEnabledCameras = cameras.filter((camera) => camera.aiEnabled).length;

  const refresh = async () => {
    const [settingsRes, healthRes] = await Promise.all([
      client.get('/ai/settings'),
      client.get('/ai/health').catch(() => ({ data: null })),
    ]);
    setSettings(settingsRes.data);
    setHealth(healthRes.data);
  };

  useEffect(() => {
    void loadData();
    void refresh();
  }, []);

  const saveSettings = async (patch: Partial<AiSettings>) => {
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await client.patch('/ai/settings', patch);
      setSettings(data.settings);
      setMessage('IA sincronizada.');
      await refresh();
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
    } finally {
      setSaving(false);
    }
  };

  const toggleCamera = async (cameraId: string, aiEnabled: boolean) => {
    await client.patch(`/cameras/${cameraId}`, { aiEnabled });
    await loadData();
  };

  const processors = health?.processors ?? {};

  return (
    <div className="min-h-full bg-background p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-border/70 bg-card/85 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <Brain className="h-3.5 w-3.5" />
              IA
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Detecção inteligente</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Controle o módulo de análise visual. No perfil standard, a IA pode permanecer desligada sem afetar live, gravação e reprodução.
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </header>

        {message && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{message}</div>}
        {settings && !settings.enabled && (
          <div className="rounded-lg border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground">
            IA desligada neste servidor. O sistema continua operando normalmente com câmeras, WebRTC, gravação e reprodução.
          </div>
        )}
        {health?.model_registry?.lastError && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{health.model_registry.lastError}</div>}

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <Card className="border-card-border bg-card/90">
            <CardHeader>
              <CardTitle>Modo ativo</CardTitle>
              <CardDescription>Escolha o comportamento quando a IA estiver ligada.</CardDescription>
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
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${settings?.enabled ? 'bg-emerald-500 text-white' : 'border border-border bg-background'}`}
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
                      className={`rounded-lg border p-4 text-left transition ${active ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-border bg-background/60 hover:bg-accent'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Icon className="h-5 w-5 text-cyan-400" />
                        <Badge variant="outline">{active ? 'Selecionado' : 'Disponível'}</Badge>
                      </div>
                      <div className="mt-3 text-sm font-semibold">{mode.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mode.description}</p>
                    </button>
                  );
                })}
              </div>

            </CardContent>
          </Card>

          <Card className="border-card-border bg-card/90">
            <CardHeader>
              <CardTitle>Operação</CardTitle>
              <CardDescription>Resumo das câmeras analisadas agora.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                { label: 'Modo ativo', value: settings?.mode === 'motion' ? 'Movimento' : settings?.mode === 'face' ? 'Rosto' : 'Pessoa e veículos' },
                { label: 'Câmeras em análise', value: String(Object.keys(processors).length) },
                { label: 'Câmeras participando', value: `${aiEnabledCameras}/${cameras.length}` },
                { label: 'Estado', value: settings?.enabled ? 'Ligada' : 'Desligada' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-background/60 p-4">
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold">{item.value}</p>
                </div>
              ))}
              <div className="rounded-lg border border-border bg-background/60 p-4">
                <p className="mb-3 text-xs font-semibold text-muted-foreground">Câmeras em análise</p>
                <div className="space-y-2">
                  {Object.keys(processors).length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma câmera em análise.</p> : null}
                  {Object.entries(processors).map(([cameraId, info]: [string, any]) => {
                    const cam = cameras.find((item) => item.id === cameraId);
                    return (
                      <div key={cameraId} className="rounded-xl bg-background/40 p-2 text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span className="truncate">{cam?.name || cameraId}</span>
                          <span className={info.running ? 'text-emerald-400' : 'text-red-400'}>{info.running ? 'ativa' : 'parada'}</span>
                        </div>
                        <details className="mt-1 text-[10px] text-muted-foreground">
                          <summary className="cursor-pointer">Detalhes</summary>
                          <div className="mt-1">
                            {info.analysis_type} | modelo: {modelLabel(info)} | gatilho: {info.motion_trigger ?? 'SYSTEM'} | {info.hibernating ? 'hibernando' : 'ativo'}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="border-card-border bg-card/90">
          <CardHeader>
            <CardTitle>Câmeras com IA</CardTitle>
            <CardDescription>Escolha quais câmeras entram na análise.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {cameras.map((camera) => (
              <div key={camera.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{camera.name}</p>
                    <p className="text-xs text-muted-foreground">{camera.zone} • {camera.isOnline ? 'online' : 'offline'}</p>
                  </div>
                </div>
                <button onClick={() => toggleCamera(camera.id, !camera.aiEnabled)} className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${camera.aiEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'border border-border text-muted-foreground'}`}>
                  {camera.aiEnabled ? 'Participa' : 'Fora'}
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
