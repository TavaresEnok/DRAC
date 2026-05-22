import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Brain, Camera, CarFront, CircleDot, Fingerprint, RefreshCw, Save, UserPlus, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getApiBaseUrl } from '@/lib/api-base';
import { useAuthStore } from '@/store/authStore';
import { useVmsDataStore } from '@/store/vmsDataStore';

type AiMode = 'motion' | 'face' | 'general' | 'recognition';

type AiSettings = {
  id: string;
  enabled: boolean;
  mode: AiMode;
  fps: number;
  updatedAt: string;
};

type Person = {
  id: string;
  name: string;
  externalId?: string | null;
  isActive: boolean;
  notes?: string | null;
  embeddings?: Array<{ id: string; createdAt: string }>;
};

const API_URL = getApiBaseUrl();

const MODES: Array<{ id: AiMode; title: string; description: string; icon: typeof Activity }> = [
  { id: 'motion', title: 'Movimento', description: 'MOG2 leve para eventos e gravação por movimento.', icon: Activity },
  { id: 'face', title: 'Rosto', description: 'SCRFD detecta presença de rosto sem rodar YOLO.', icon: Users },
  { id: 'general', title: 'Geral', description: 'YOLO11n OpenVINO detecta pessoa, carro, moto e bicicleta.', icon: CarFront },
  { id: 'recognition', title: 'Reconhecimento', description: 'SCRFD + ArcFace identifica pessoas cadastradas.', icon: Fingerprint },
];

function useApi() {
  const token = useAuthStore((state) => state.accessToken);
  return useMemo(() => axios.create({
    baseURL: API_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }), [token]);
}

export default function AIPage() {
  const client = useApi();
  const cameras = useVmsDataStore((state) => state.cameras);
  const loadData = useVmsDataStore((state) => state.load);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [personName, setPersonName] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const aiEnabledCameras = cameras.filter((camera) => camera.aiEnabled).length;

  const refresh = async () => {
    const [settingsRes, healthRes, peopleRes] = await Promise.all([
      client.get('/ai/settings'),
      client.get('/ai/health').catch(() => ({ data: null })),
      client.get('/faces/persons').catch(() => ({ data: [] })),
    ]);
    setSettings(settingsRes.data);
    setHealth(healthRes.data);
    setPeople(Array.isArray(peopleRes.data) ? peopleRes.data : []);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const saveSettings = async (patch: Partial<AiSettings>) => {
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await client.patch('/ai/settings', patch);
      setSettings(data.settings);
      setMessage('Runtime de IA sincronizado com o novo modo global.');
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
      setMessage('Sincronização manual concluída.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCamera = async (cameraId: string, aiEnabled: boolean) => {
    await client.patch(`/cameras/${cameraId}`, { aiEnabled });
    await loadData();
  };

  const createPerson = async () => {
    if (!personName.trim()) return;
    setSaving(true);
    try {
      await client.post('/faces/persons', { name: personName.trim() });
      setPersonName('');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const enroll = async () => {
    if (!selectedPersonId || !selectedFile) return;
    setSaving(true);
    const form = new FormData();
    form.append('file', selectedFile);
    try {
      await client.post(`/faces/persons/${selectedPersonId}/enroll`, form);
      setSelectedFile(null);
      await refresh();
      setMessage('Face cadastrada na galeria de reconhecimento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,hsl(var(--accent))_0,transparent_34rem)] p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/85 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              <Brain className="h-3.5 w-3.5" />
              IA Central
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Módulos de detecção e reconhecimento</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              O DRAC executa um único modo global por vez para proteger CPU/RAM. As câmeras abaixo apenas participam ou não do runtime ativo.
            </p>
          </div>
          <button
            onClick={syncNow}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            Sincronizar IA
          </button>
        </header>

        {message && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{message}</div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <Card className="border-card-border bg-card/90">
            <CardHeader>
              <CardTitle>Modo global ativo</CardTitle>
              <CardDescription>Escolha apenas um módulo para o sistema inteiro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background/60 p-4">
                <div>
                  <div className="text-sm font-semibold">Runtime central</div>
                  <div className="text-xs text-muted-foreground">Estado atual: {settings?.enabled ? 'ativo' : 'desligado'}</div>
                </div>
                <button
                  onClick={() => saveSettings({ enabled: !settings?.enabled })}
                  disabled={!settings || saving}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold ${settings?.enabled ? 'bg-emerald-500 text-white' : 'border border-border bg-background'}`}
                >
                  {settings?.enabled ? 'Ativo' : 'Desligado'}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {MODES.map((mode) => {
                  const Icon = mode.icon;
                  const active = settings?.mode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => saveSettings({ mode: mode.id })}
                      disabled={saving}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-border bg-background/60 hover:bg-accent'
                      }`}
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
              <CardTitle>Saúde do runtime</CardTitle>
              <CardDescription>Modelos carregados e processadores ativos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                { label: 'Modo carregado', value: health?.model_registry?.mode ?? settings?.mode ?? '-' },
                { label: 'Processadores ativos', value: String(Object.keys(health?.processors ?? {}).length) },
                { label: 'Câmeras participando', value: `${aiEnabledCameras}/${cameras.length}` },
                { label: 'FPS global', value: String(settings?.fps ?? health?.process_fps ?? '-') },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-background/60 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold">{item.value}</p>
                </div>
              ))}
              {health?.model_registry?.lastError && (
                <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-200">
                  {health.model_registry.lastError}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-card-border bg-card/90">
            <CardHeader>
              <CardTitle>Câmeras no runtime</CardTitle>
              <CardDescription>As câmeras não escolhem modo individual. Elas apenas participam do modo global.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {cameras.map((camera) => (
                <div key={camera.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{camera.name}</p>
                      <p className="text-xs text-muted-foreground">{camera.zone} • {camera.isOnline ? 'online' : 'offline'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCamera(camera.id, !camera.aiEnabled)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${camera.aiEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'border border-border text-muted-foreground'}`}
                  >
                    {camera.aiEnabled ? 'Participa' : 'Fora'}
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-card-border bg-card/90">
            <CardHeader>
              <CardTitle>Pessoas e reconhecimento facial</CardTitle>
              <CardDescription>Cadastre pessoas e envie fotos para gerar embeddings ArcFace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  placeholder="Nome da pessoa"
                  className="h-10 flex-1 rounded-xl border border-border bg-background/70 px-3 text-sm outline-none"
                />
                <button onClick={createPerson} disabled={saving || !personName.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-50">
                  <UserPlus className="h-4 w-4" />
                  Criar
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <select value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)} className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm">
                  <option value="">Selecionar pessoa</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
                <input type="file" accept="image/*" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="h-10 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs" />
                <button onClick={enroll} disabled={saving || !selectedPersonId || !selectedFile} className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-500 px-3 text-xs font-semibold text-white disabled:opacity-50">
                  <Save className="h-4 w-4" />
                  Enroll
                </button>
              </div>

              <div className="space-y-2">
                {people.map((person) => (
                  <div key={person.id} className="flex items-center justify-between rounded-2xl border border-border bg-background/60 p-3">
                    <div>
                      <p className="text-sm font-medium">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.embeddings?.length ?? 0} embedding(s)</p>
                    </div>
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${person.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                      <CircleDot className="h-3 w-3" />
                      {person.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
