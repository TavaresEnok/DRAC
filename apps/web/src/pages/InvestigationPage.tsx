import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { addMinutes, format, subHours } from 'date-fns';
import { Archive, Camera, Clock, Edit, FileText, LoaderCircle, Plus, Save, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { useVmsDataStore } from '../store/vmsDataStore';

const TRACK_COLORS = ['hsl(213 68% 57%)', 'hsl(35 95% 55%)', 'hsl(354 52% 52%)', 'hsl(150 45% 45%)'];
const API_URL = getApiBaseUrl();

type InvestigationItem = {
  id: string;
  type: 'event' | 'clip' | 'snapshot' | string;
  label: string;
  cameraId?: string | null;
  cameraName?: string | null;
  eventId?: string | null;
  recordingId?: string | null;
  timestamp: string;
  notes?: string | null;
};

type Investigation = {
  id: string;
  title: string;
  status: string;
  summary?: string | null;
  selectedCameraIds: string[];
  timeStart: string;
  timeEnd: string;
  playbackSpeed: string;
  activeTrackTime: number;
  createdAt: string;
  updatedAt: string;
  items: InvestigationItem[];
};

function authHeaders(accessToken: string | null) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

export default function InvestigationPage() {
  const [location, setLocation] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const events = useVmsDataStore((state) => state.events);

  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [investigationId, setInvestigationId] = useState<string>('');
  const [investigationName, setInvestigationNome] = useState(`INV-${format(new Date(), 'yyyyMMdd-HHmm')} — Área de trabalho`);
  const [editingNome, setEditingNome] = useState(false);
  const [selectedCams, setSelectedCams] = useState<string[]>([]);
  const [timeStart, setTimeStart] = useState(format(subHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
  const [timeEnd, setTimeEnd] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [playbackSpeed, setPlaybackSpeed] = useState('1x');
  const [activeTrackTime, setActiveTrackTime] = useState(45);
  const [evidence, setEvidence] = useState<InvestigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [query, setQuery] = useState('');

  const requestedInvestigationId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('id');
  }, [location]);

  const client = useMemo(() => axios.create({ baseURL: API_URL, headers: authHeaders(accessToken) }), [accessToken]);

  const hydrate = useCallback((item: Investigation) => {
    setInvestigationId(item.id);
    setInvestigationNome(item.title);
    setSelectedCams(Array.isArray(item.selectedCameraIds) ? item.selectedCameraIds : []);
    setTimeStart(format(new Date(item.timeStart), "yyyy-MM-dd'T'HH:mm"));
    setTimeEnd(format(new Date(item.timeEnd), "yyyy-MM-dd'T'HH:mm"));
    setPlaybackSpeed(item.playbackSpeed || '1x');
    setActiveTrackTime(item.activeTrackTime || 0);
    setEvidence(item.items || []);
  }, []);

  const loadInvestigations = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { data } = await client.get<{ items: Investigation[] }>('/investigations');
      const items = Array.isArray(data.items) ? data.items : [];
      setInvestigations(items);
      const selected =
        (requestedInvestigationId && items.find((item) => item.id === requestedInvestigationId)) ||
        items[0] ||
        null;
      if (selected) {
        hydrate(selected);
      } else if (cameras.length) {
        setSelectedCams(cameras.slice(0, Math.min(4, cameras.length)).map((camera) => camera.id));
      }
    } catch (error) {
      toast({
        title: 'Falha ao carregar investigations',
        description: error instanceof Error ? error.message : 'Não foi possível carregar as áreas de trabalho.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, cameras, client, hydrate, requestedInvestigationId]);

  useEffect(() => {
    void loadInvestigations();
  }, [loadInvestigations]);

  const currentInvestigation = investigations.find((item) => item.id === investigationId) ?? null;

  const trackEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .filter((event) => selectedCams.includes(event.cameraId))
      .filter((event) => {
        const ts = new Date(event.timestamp).getTime();
        if (ts < new Date(timeStart).getTime() || ts > new Date(timeEnd).getTime()) return false;
        if (!q) return true;
        return event.cameraName.toLowerCase().includes(q) || event.type.toLowerCase().includes(q) || event.description.toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [events, query, selectedCams, timeEnd, timeStart]);

  const totalMs = new Date(timeEnd).getTime() - new Date(timeStart).getTime();

  const saveWorkspace = useCallback(async () => {
    if (!accessToken) return;
    if (!selectedCams.length) {
      toast({ title: 'Selecione câmeras', description: 'A área de trabalho precisa de pelo menos uma câmera.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      title: investigationName.trim(),
      selectedCameraIds: selectedCams,
      timeStart: new Date(timeStart).toISOString(),
      timeEnd: new Date(timeEnd).toISOString(),
      playbackSpeed,
      activeTrackTime,
    };

    try {
      if (investigationId) {
        const { data } = await client.patch<Investigation>(`/investigations/${investigationId}`, payload);
        setInvestigations((items) => items.map((item) => (item.id === data.id ? data : item)));
        hydrate(data);
      } else {
        const { data } = await client.post<Investigation>('/investigations', payload);
        setInvestigations((items) => [data, ...items]);
        hydrate(data);
        setLocation(`/investigation?id=${encodeURIComponent(data.id)}`);
      }
      toast({ title: 'Área de trabalho salva', description: 'A investigação foi persistida no backend.' });
    } catch (error) {
      toast({ title: 'Falha ao salvar', description: error instanceof Error ? error.message : 'Não foi possível salvar a área de trabalho.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [accessToken, activeTrackTime, client, hydrate, investigationId, investigationName, playbackSpeed, selectedCams, setLocation, timeEnd, timeStart]);

  const addEvidenceFromEvent = useCallback(async (event: (typeof events)[number]) => {
    if (!investigationId) {
      await saveWorkspace();
    }

    const targetId = investigationId || investigations[0]?.id;
    if (!targetId) return;

    try {
      const { data } = await client.post<InvestigationItem>(`/investigations/${targetId}/items`, {
        type: 'event',
        label: `${event.type.replace(/_/g, ' ').toUpperCase()} — ${event.cameraName}`,
        cameraId: event.cameraId,
        cameraName: event.cameraName,
        eventId: event.id,
        timestamp: new Date(event.timestamp).toISOString(),
        notes: '',
      });
      setEvidence((items) => [...items, data]);
      setInvestigations((items) => items.map((item) => item.id === targetId ? { ...item, items: [...item.items, data] } : item));
      toast({ title: 'Evidência adicionada', description: 'O evento foi anexado à investigação.' });
    } catch (error) {
      toast({ title: 'Falha ao anexar evidência', description: error instanceof Error ? error.message : 'Não foi possível anexar o evento.', variant: 'destructive' });
    }
  }, [client, events, investigationId, investigations, saveWorkspace]);

  const updateEvidenceNãotes = useCallback(async (itemId: string, notes: string) => {
    if (!investigationId) return;
    setEvidence((items) => items.map((item) => item.id === itemId ? { ...item, notes } : item));
    try {
      await client.patch(`/investigations/${investigationId}/items/${itemId}`, { notes });
    } catch (error) {
      toast({ title: 'Falha ao salvar nota', description: error instanceof Error ? error.message : 'Não foi possível salvar a nota.', variant: 'destructive' });
    }
  }, [client, investigationId]);

  const removeEvidence = useCallback(async (itemId: string) => {
    if (!investigationId) return;
    try {
      await client.delete(`/investigations/${investigationId}/items/${itemId}`);
      setEvidence((items) => items.filter((item) => item.id !== itemId));
    } catch (error) {
      toast({ title: 'Falha ao remover item', description: error instanceof Error ? error.message : 'Não foi possível remover a evidência.', variant: 'destructive' });
    }
  }, [client, investigationId]);

  const transitionLifecycle = useCallback(async (status: 'OPEN' | 'ACTIVE' | 'REVIEW' | 'CLOSED' | 'ARCHIVED') => {
    if (!investigationId) {
      toast({ title: 'Salve a área de trabalho primeiro', description: 'Crie a investigação antes de alterar o ciclo de vida.', variant: 'destructive' });
      return;
    }
    setTransitioning(true);
    try {
      const { data } = await client.post<Investigation>(`/investigations/${investigationId}/lifecycle`, { status });
      setInvestigations((items) => items.map((item) => (item.id === data.id ? data : item)));
      hydrate(data);
      toast({ title: 'Ciclo de vida atualizado', description: `Status alterado para ${status}.` });
    } catch (error) {
      toast({
        title: 'Falha ao atualizar ciclo de vida',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o status da investigação.',
        variant: 'destructive',
      });
    } finally {
      setTransitioning(false);
    }
  }, [client, hydrate, investigationId]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando investigação...</div></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(222_18%_7%)]">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-3 shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
          {editingNome ? (
            <input
              value={investigationName}
              onChange={(event) => setInvestigationNome(event.target.value)}
              onBlur={() => setEditingNome(false)}
              onKeyDown={(event) => event.key === 'Enter' && setEditingNome(false)}
              className="h-8 w-[min(520px,60vw)] rounded border border-[hsl(var(--primary))] bg-background px-3 text-sm font-semibold focus:outline-none"
              autoFocus
            />
          ) : (
            <button onClick={() => setEditingNome(true)} className="flex items-center gap-2 truncate text-sm font-semibold hover:text-[hsl(var(--primary))]">
              <span className="truncate">{investigationName}</span>
              <Edit className="h-3.5 w-3.5 opacity-50" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={investigationId || '__new__'} onValueChange={(value) => {
            if (value === '__new__') {
              setInvestigationId('');
              setInvestigationNome(`INV-${format(new Date(), 'yyyyMMdd-HHmm')} — Área de trabalho`);
              setEvidence([]);
              return;
            }
            const next = investigations.find((item) => item.id === value);
            if (next) {
              hydrate(next);
              setLocation(`/investigation?id=${encodeURIComponent(next.id)}`);
            }
          }}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Selecionar área de trabalho" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__new__" className="text-xs">Nova área de trabalho</SelectItem>
              {investigations.map((item) => <SelectItem key={item.id} value={item.id} className="text-xs">{item.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={() => void saveWorkspace()} className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-50" disabled={saving}>
            {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar área de trabalho
          </button>
          <Select value={currentInvestigation?.status ?? 'OPEN'} onValueChange={(value) => void transitionLifecycle(value as 'OPEN' | 'ACTIVE' | 'REVIEW' | 'CLOSED' | 'ARCHIVED')} disabled={!investigationId || transitioning}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {['OPEN', 'ACTIVE', 'REVIEW', 'CLOSED', 'ARCHIVED'].map((status) => <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={() => setLocation('/evidence')} className="flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--primary-foreground))] hover:opacity-90">
            <Archive className="h-3.5 w-3.5" /> Exportar Evidência
          </button>
        </div>
      </div>

      <div className="border-b border-border bg-card px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-56 rounded border border-border bg-background pl-8 pr-3 text-xs" placeholder="Buscar câmera ou evento" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {selectedCams.map((camId, index) => {
              const camera = cameras.find((item) => item.id === camId);
              if (!camera) return null;
              return (
                <button key={camId} onClick={() => setSelectedCams((items) => items.filter((id) => id !== camId))} className="flex h-7 items-center gap-2 rounded border border-border px-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLORS[index % TRACK_COLORS.length] }} />
                  <span className="font-mono">{camera.code}</span>
                  <X className="h-3 w-3 opacity-60" />
                </button>
              );
            })}
          </div>
          <Select onValueChange={(id) => !selectedCams.includes(id) && setSelectedCams((items) => [...items, id])}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Adicionar câmera" /></SelectTrigger>
            <SelectContent>
              {cameras.filter((camera) => !selectedCams.includes(camera.id)).map((camera) => <SelectItem key={camera.id} value={camera.id} className="text-xs font-mono">{camera.code} — {camera.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="datetime-local" value={timeStart} onChange={(event) => setTimeStart(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs font-mono" />
          <input type="datetime-local" value={timeEnd} onChange={(event) => setTimeEnd(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs font-mono" />
          <div className="ml-auto flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="font-mono">{trackEvents.length} eventos</span>
            <span>•</span>
            <span className="font-mono">{playbackSpeed}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-72 shrink-0 border-r border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-semibold">Eventos no intervalo</div>
            <div className="mt-0.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">{trackEvents.length} ocorrências encontradas</div>
          </div>
          <div className="divide-y divide-border overflow-y-auto">
            {trackEvents.map((event) => (
              <button key={event.id} onClick={() => setActiveTrackTime(new Date(event.timestamp).getHours() * 60 + new Date(event.timestamp).getMinutes())} className="w-full px-4 py-3 text-left hover:bg-[hsl(var(--accent))]">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${event.severity === 'critical' ? 'status-alarm' : event.severity === 'warning' ? 'status-motion' : 'status-online'}`} />
                  <span className="text-[11px] font-medium capitalize">{event.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{event.cameraName}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{format(new Date(event.timestamp), 'HH:mm:ss')}</div>
                <div className="mt-2 text-[10px] text-[hsl(var(--primary))]" onClick={(click) => { click.stopPropagation(); void addEvidenceFromEvent(event); }}>Adicionar à evidência</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {selectedCams.map((camId, index) => {
                const camera = cameras.find((item) => item.id === camId);
                if (!camera) return null;
                const cameraEvents = trackEvents.filter((event) => event.cameraId === camId);
                const color = TRACK_COLORS[index % TRACK_COLORS.length];

                return (
                  <div key={camId} className="relative overflow-hidden rounded-xl border border-border bg-black/90 shadow-sm">
                    <div className="flex items-start justify-between px-3 py-2 text-[10px]">
                      <div>
                        <div className="font-mono text-white/80">{camera.code}</div>
                        <div className="text-white/55">{camera.name}</div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-white/55">
                        <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-300">REC</span>
                        <span>{camera.ptzCapable ? 'PTZ' : 'FIXED'}</span>
                      </div>
                    </div>
                    <div className="relative h-44 border-y border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_60%)]">
                      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                      <div className="absolute inset-0 flex items-center justify-center"><Camera className="h-10 w-10 text-white/10" /></div>
                      <div className="absolute inset-x-0 top-0 flex justify-between px-3 py-2 text-[10px] font-mono text-white/70">
                        <span>{camera.code} · {camera.name}</span>
                        <span>{format(new Date(), 'HH:mm:ss')} UTC</span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5"><div className="h-full" style={{ width: '72%', background: color }} /></div>
                      {cameraEvents.map((event) => {
                        const eventMs = new Date(event.timestamp).getTime() - new Date(timeStart).getTime();
                        const pct = Math.max(0, Math.min(100, totalMs > 0 ? (eventMs / totalMs) * 100 : 0));
                        return <div key={event.id} className="absolute bottom-2 h-5 w-1 rounded" style={{ left: `${pct}%`, background: event.severity === 'critical' ? 'hsl(354 52% 52%)' : event.severity === 'warning' ? 'hsl(35 95% 55%)' : color }} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <button className="h-8 rounded border border-border px-3 text-xs hover:bg-[hsl(var(--accent))]" onClick={() => setActiveTrackTime((value) => Math.max(0, value - 5))}>⟲</button>
                <button className="h-8 rounded bg-[hsl(var(--primary))] px-4 text-xs font-semibold text-[hsl(var(--primary-foreground))]">▶</button>
                <button className="h-8 rounded border border-border px-3 text-xs hover:bg-[hsl(var(--accent))]" onClick={() => setActiveTrackTime((value) => value + 5)}>⟳</button>
                <div className="ml-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{format(addMinutes(new Date(timeStart), activeTrackTime), 'HH:mm:ss')}</div>
                <div className="ml-4 flex items-center gap-1">
                  {['0.25x', '0.5x', '1x', '2x', '4x'].map((speed) => (
                    <button key={speed} onClick={() => setPlaybackSpeed(speed)} className={`rounded px-2 py-1 text-[10px] ${playbackSpeed === speed ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-border hover:bg-[hsl(var(--accent))]'}`}>
                      {speed}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <div className="flex h-8 items-center bg-[hsl(var(--muted))] text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                  {Array.from({ length: 12 }, (_, index) => <div key={index} className="flex-1 border-r border-border/50 px-2">{format(addMinutes(new Date(timeStart), index * 5), 'HH:mm')}</div>)}
                </div>
                <div className="relative h-10 bg-[hsl(222_18%_10%)]">
                  <div className="absolute inset-y-2 left-0 right-0 bg-[hsl(213_68%_57%_/_0.18)]" />
                  <div className="absolute inset-y-2 left-[32%] right-[54%] bg-[hsl(35_95%_55%_/_0.28)]" />
                  <div className="absolute inset-y-2 left-[58%] right-[36%] bg-[hsl(354_52%_52%_/_0.35)]" />
                  <div className="absolute inset-y-0 w-0.5 bg-[hsl(var(--primary))]" style={{ left: `${Math.min(100, (activeTrackTime / (24 * 60)) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-72 shrink-0 border-l border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-xs font-semibold">Evidência</div>
              <div className="mt-0.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">{evidence.length} itens</div>
            </div>
            <button onClick={() => setLocation('/evidence')} className="text-[10px] font-semibold text-[hsl(var(--primary))]">Exportar</button>
          </div>
          <div className="divide-y divide-border overflow-y-auto">
            {evidence.map((item) => (
              <div key={item.id} className="group px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {item.type === 'event' ? <Clock className="h-3 w-3 text-[hsl(var(--muted-foreground))]" /> : item.type === 'clip' ? <Camera className="h-3 w-3 text-[hsl(var(--muted-foreground))]" /> : <FileText className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />}
                      <div className="truncate text-[11px] font-medium">{item.label}</div>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{item.cameraName}</div>
                    <div className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{format(new Date(item.timestamp), 'HH:mm:ss')}</div>
                  </div>
                  <button onClick={() => void removeEvidence(item.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                  </button>
                </div>
                <textarea
                  value={item.notes ?? ''}
                  onChange={(event) => setEvidence((items) => items.map((current) => current.id === item.id ? { ...current, notes: event.target.value } : current))}
                  onBlur={(event) => void updateEvidenceNãotes(item.id, event.target.value)}
                  placeholder="Nãotas objetivas..."
                  className="mt-2 w-full resize-none rounded border border-border bg-[hsl(var(--muted))] p-2 text-[10px] focus:outline-none"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-card px-5 py-2 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
        <div className="flex items-center gap-5">
          <span className="text-[hsl(var(--destructive))]">{trackEvents.filter((event) => event.severity === 'critical').length} eventos críticos</span>
          <span>CAMS: {selectedCams.length}</span>
          <span>EVD: {evidence.length}</span>
          <span>SPD: {playbackSpeed}</span>
          <span>INV: {currentInvestigation?.status ?? 'DRAFT'}</span>
        </div>
        <div>{format(new Date(), 'yyyy-MM-dd HH:mm:ss')} UTC</div>
      </div>
    </div>
  );
}
