import { useState } from 'react';
import { addMinutes, format, subHours } from 'date-fns';
import { Archive, Camera, Clock, Edit, FileText, Plus, Save, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MOCK_CAMERAS, MOCK_EVENTS } from '../data/mockData';

const TRACK_COLORS = [
  'hsl(213 68% 57%)',
  'hsl(35 95% 55%)',
  'hsl(354 52% 52%)',
  'hsl(150 45% 45%)',
];

type EvidenceItem = {
  id: string;
  type: 'event' | 'clip' | 'snapshot';
  label: string;
  cameraName: string;
  timestamp: string;
  notes: string;
};

export default function InvestigationPage() {
  const [, setLocation] = useLocation();
  const [investigationName, setInvestigationName] = useState('INV-2026-0503 — Perimeter Breach Review');
  const [editingName, setEditingName] = useState(false);
  const [selectedCams, setSelectedCams] = useState<string[]>(MOCK_CAMERAS.slice(0, 4).map(c => c.id));
  const [timeStart, setTimeStart] = useState(format(subHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
  const [timeEnd, setTimeEnd] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [playbackSpeed, setPlaybackSpeed] = useState('1x');
  const [activeTrackTime, setActiveTrackTime] = useState(45);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([
    { id: 'e1', type: 'event', label: 'INTRUSION — Perimeter North', cameraName: MOCK_CAMERAS[0].name, timestamp: new Date().toISOString(), notes: 'Confirmed perimeter breach from synchronized review.' },
    { id: 'e2', type: 'clip', label: '14:23:12 — 14:24:05 Clip', cameraName: MOCK_CAMERAS[1].name, timestamp: new Date().toISOString(), notes: '' },
  ]);

  const trackEvents = MOCK_EVENTS.filter(e => selectedCams.includes(e.cameraId)).slice(0, 16);
  const totalMs = new Date(timeEnd).getTime() - new Date(timeStart).getTime();

  const addEvidenceFromEvent = (evt: typeof MOCK_EVENTS[0]) => {
    setEvidence(prev => [...prev, {
      id: `ev-${Date.now()}`,
      type: 'event',
      label: `${evt.type.replace(/_/g, ' ').toUpperCase()} — ${evt.cameraName}`,
      cameraName: evt.cameraName,
      timestamp: evt.timestamp,
      notes: '',
    }]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(222_18%_7%)]">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-3 shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
          {editingName ? (
            <input
              value={investigationName}
              onChange={e => setInvestigationName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
              className="h-8 w-[min(520px,60vw)] rounded border border-[hsl(var(--primary))] bg-background px-3 text-sm font-semibold focus:outline-none"
              autoFocus
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="flex items-center gap-2 truncate text-sm font-semibold hover:text-[hsl(var(--primary))]">
              <span className="truncate">{investigationName}</span>
              <Edit className="h-3.5 w-3.5 opacity-50" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs hover:bg-[hsl(var(--accent))]">
            <Save className="h-3.5 w-3.5" /> Salvar Workspace
          </button>
          <button onClick={() => setLocation('/evidence')} className="flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--primary-foreground))] hover:opacity-90">
            <Archive className="h-3.5 w-3.5" /> Exportar Evidência
          </button>
        </div>
      </div>

      <div className="border-b border-border bg-card px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input className="h-8 w-56 rounded border border-border bg-background pl-8 pr-3 text-xs" placeholder="Buscar câmera ou evento" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {selectedCams.map((camId, i) => {
              const cam = MOCK_CAMERAS.find(c => c.id === camId);
              if (!cam) return null;
              return (
                <button key={camId} onClick={() => setSelectedCams(prev => prev.filter(id => id !== camId))} className="flex h-7 items-center gap-2 rounded border border-border px-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }} />
                  <span className="font-mono">{cam.code}</span>
                  <X className="h-3 w-3 opacity-60" />
                </button>
              );
            })}
          </div>
          <Select onValueChange={id => !selectedCams.includes(id) && setSelectedCams(prev => [...prev, id])}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Adicionar câmera" /></SelectTrigger>
            <SelectContent>
              {MOCK_CAMERAS.filter(c => !selectedCams.includes(c.id)).map(c => <SelectItem key={c.id} value={c.id} className="text-xs font-mono">{c.code} — {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="font-mono">{trackEvents.length} eventos</span>
            <span>•</span>
            <span className="font-mono">1x</span>
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
            {trackEvents.map(evt => (
              <button key={evt.id} onClick={() => setActiveTrackTime(new Date(evt.timestamp).getHours() * 60 + new Date(evt.timestamp).getMinutes())} className="w-full px-4 py-3 text-left hover:bg-[hsl(var(--accent))]">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${evt.severity === 'critical' ? 'status-alarm' : evt.severity === 'warning' ? 'status-motion' : 'status-online'}`} />
                  <span className="text-[11px] font-medium capitalize">{evt.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{evt.cameraName}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{format(new Date(evt.timestamp), 'HH:mm:ss')}</div>
                <div className="mt-2 text-[10px] text-[hsl(var(--primary))]">Adicionar à evidência</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {selectedCams.map((camId, i) => {
                const cam = MOCK_CAMERAS.find(c => c.id === camId);
                if (!cam) return null;
                const camEvents = trackEvents.filter(e => e.cameraId === camId);
                const color = TRACK_COLORS[i % TRACK_COLORS.length];

                return (
                  <div key={camId} className="relative overflow-hidden rounded-xl border border-border bg-black/90 shadow-sm">
                    <div className="flex items-start justify-between px-3 py-2 text-[10px]">
                      <div>
                        <div className="font-mono text-white/80">{cam.code}</div>
                        <div className="text-white/55">{cam.name}</div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-white/55">
                        <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-300">REC</span>
                        <span>PTZ</span>
                      </div>
                    </div>
                    <div className="relative h-44 border-y border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_60%)]">
                      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera className="h-10 w-10 text-white/10" />
                      </div>
                      <div className="absolute inset-x-0 top-0 flex justify-between px-3 py-2 text-[10px] font-mono text-white/70">
                        <span>{cam.code} · {cam.name}</span>
                        <span>{format(new Date(), 'HH:mm:ss')} UTC</span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5">
                        <div className="h-full" style={{ width: '72%', background: color }} />
                      </div>
                      {camEvents.map(evt => {
                        const evtMs = new Date(evt.timestamp).getTime() - new Date(timeStart).getTime();
                        const pct = Math.max(0, Math.min(100, (evtMs / totalMs) * 100));
                        return <div key={evt.id} className="absolute bottom-2 h-5 w-1 rounded" style={{ left: `${pct}%`, background: evt.severity === 'critical' ? 'hsl(354 52% 52%)' : evt.severity === 'warning' ? 'hsl(35 95% 55%)' : color }} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <button className="h-8 rounded border border-border px-3 text-xs hover:bg-[hsl(var(--accent))]">⟲</button>
                <button className="h-8 rounded bg-[hsl(var(--primary))] px-4 text-xs font-semibold text-[hsl(var(--primary-foreground))]">▶</button>
                <button className="h-8 rounded border border-border px-3 text-xs hover:bg-[hsl(var(--accent))]">⟳</button>
                <div className="ml-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">14:23:45</div>
                <div className="ml-4 flex items-center gap-1">
                  {['0.25x', '0.5x', '1x', '2x', '4x'].map(speed => (
                    <button key={speed} onClick={() => setPlaybackSpeed(speed)} className={`rounded px-2 py-1 text-[10px] ${playbackSpeed === speed ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-border hover:bg-[hsl(var(--accent))]'}`}>
                      {speed}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <div className="flex h-8 items-center bg-[hsl(var(--muted))] text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                  {Array.from({ length: 12 }, (_, i) => <div key={i} className="flex-1 border-r border-border/50 px-2">{format(addMinutes(new Date(timeStart), i * 5), 'HH:mm')}</div>)}
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
            {evidence.map(item => (
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
                  <button onClick={() => setEvidence(prev => prev.filter(e => e.id !== item.id))} className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                  </button>
                </div>
                <textarea
                  value={item.notes}
                  onChange={e => setEvidence(prev => prev.map(current => current.id === item.id ? { ...current, notes: e.target.value } : current))}
                  placeholder="Notas objetivas..."
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
          <span className="text-[hsl(var(--destructive))]">8 Alarmes Ativos</span>
          <span>CPU: 34%</span>
          <span>RAM: 67%</span>
          <span>STR: 78%</span>
          <span>↑ 850 Mbps</span>
          <span>↓ 120 Mbps</span>
        </div>
        <div>{format(new Date(), 'yyyy-MM-dd HH:mm:ss')} UTC</div>
      </div>
    </div>
  );
}