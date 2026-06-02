import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { Search, Filter, CheckCheck, X, ChevronRight, ExternalLink, Shield, Clock, Archive, Video } from 'lucide-react';
import { VMSEvent, useVmsDataStore } from '../store/vmsDataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocation } from 'wouter';

const EVENT_TYPE_LABELS: Record<string, string> = {
  motion_detected: 'Movimento Detectado',
  door_open: 'Porta Aberta',
  tailgating: 'Entrada Não Autorizada',
  intrusion: 'Intrusão',
  camera_offline: 'Câmera Offline',
  alarm_triggered: 'Alarme Disparado',
  ptz_tour_started: 'Ronda PTZ Iniciada',
  recording_gap: 'Lacuna de Gravação',
  face_detected: 'Rosto Detectado',
  HEALTH_CAMERA_OFFLINE: 'Câmera Offline (Saúde)',
  HEALTH_RECORDING_STALE: 'Rotina interna de gravação',
  HEALTH_RECORDING_RECOVERED: 'Gravação Recuperada',
  HEALTH_AUTO_RECOVERED: 'Câmera Recuperada (Saúde)',
  HEALTH_RECORDING_RECONNECT_REQUESTED: 'Reconexão de Gravação Solicitada',
  HEALTH_RECORDING_RECONNECT_SUCCESS: 'Reconexão de Gravação Concluída',
  HEALTH_RECORDING_RECONNECT_FAILED: 'Falha na Reconexão de Gravação',
};

const SEV_STYLES: Record<string, string> = {
  critical: 'bg-[hsl(var(--destructive)_/_0.12)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.28)]',
  warning: 'bg-[hsl(var(--chart-2)_/_0.12)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.28)]',
  info: 'bg-[hsl(var(--chart-1)_/_0.10)] text-[hsl(var(--chart-1))] border-[hsl(var(--chart-1)_/_0.20)]',
};

const PAGE_SIZE = 18;

function severityLabel(severity: VMSEvent['severity']) {
  return severity === 'critical' ? 'Crítico' : severity === 'warning' ? 'Alto' : 'Médio';
}

export default function EventosPage() {
  const [, setLocation] = useLocation();
  const events = useVmsDataStore((state) => state.events);
  const cameras = useVmsDataStore((state) => state.cameras);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ackFilter, setAckFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerEvent, setDrawerEvent] = useState<VMSEvent | null>(events[0] ?? null);

  const filtered = events.filter(evt => {
    if (search && !evt.cameraName.toLowerCase().includes(search.toLowerCase()) && !evt.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (sevFilter !== 'all' && evt.severity !== sevFilter) return false;
    if (typeFilter !== 'all' && evt.type !== typeFilter) return false;
    if (ackFilter === 'unacknowledged' && evt.acknowledged) return false;
    if (ackFilter === 'acknowledged' && !evt.acknowledged) return false;
    if (healthFilter === 'health' && !evt.type.startsWith('HEALTH_')) return false;
    if (healthFilter === 'stream' && !evt.type.startsWith('STREAM_')) return false;
    if (healthFilter === 'degraded' && evt.type !== 'HEALTH_RECORDING_STALE') return false;
    if (healthFilter === 'recovered' && evt.type !== 'HEALTH_RECORDING_RECOVERED' && evt.type !== 'HEALTH_AUTO_RECOVERED') return false;
    return true;
  });

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const current = drawerEvent ?? pageData[0] ?? filtered[0] ?? events[0];
  const currentCamera = current ? cameras.find(c => c.id === current.cameraId) : undefined;

  const stats = useMemo(() => ({
    total: filtered.length,
    critical: filtered.filter(e => e.severity === 'critical').length,
    open: filtered.filter(e => !e.acknowledged).length,
  }), [filtered]);

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  };

  return (
    <div className="h-full min-h-0 p-5">
      <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)] gap-4">
        <div className="flex min-h-0 flex-col rounded-2xl border border-card-border bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
            <div className="space-y-1">
              <h2 className="text-[14px] font-semibold tracking-tight">Eventos</h2>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Ocorrências recentes das câmeras.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: stats.total },
                { label: 'Críticos', value: stats.critical, color: 'text-[hsl(var(--destructive))]' },
                { label: 'Abertos', value: stats.open, color: 'text-[hsl(var(--chart-2))]' },
              ].map(card => (
                <div key={card.label} className="rounded-xl border border-border bg-[hsl(var(--muted))] px-3 py-2">
                  <div className={`text-[12px] font-semibold ${card.color ?? 'text-foreground'}`}>{card.value}</div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{card.label}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="search"
                  placeholder="Buscar evento ou câmera..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="h-8 w-full rounded-xl border border-border bg-background pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] placeholder:text-[hsl(var(--muted-foreground)_/_0.5)]"
                />
              </div>
              <Select value={sevFilter} onValueChange={v => { setSevFilter(v); setPage(0); }}>
                <SelectTrigger className="w-28 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    { value: 'all', label: 'Todas' },
                    { value: 'critical', label: 'Crítico' },
                    { value: 'warning', label: 'Alto' },
                    { value: 'info', label: 'Médio' },
                  ].map((s) => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={ackFilter} onValueChange={v => { setAckFilter(v); setPage(0); }}>
                <SelectTrigger className="w-32 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Status</SelectItem>
                  <SelectItem value="unacknowledged" className="text-xs">Não reconhecido</SelectItem>
                  <SelectItem value="acknowledged" className="text-xs">Reconhecido</SelectItem>
                </SelectContent>
              </Select>
              <details className="w-full rounded-xl border border-border bg-background/55 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-[hsl(var(--muted-foreground))]">Filtros avançados</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-40 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">Todos os tipos</SelectItem>
                      {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={healthFilter} onValueChange={v => { setHealthFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-44 h-8 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">Operação: todas</SelectItem>
                      <SelectItem value="health" className="text-xs">Somente saúde</SelectItem>
                      <SelectItem value="stream" className="text-xs">Somente transmissão</SelectItem>
                      <SelectItem value="degraded" className="text-xs">Rotina de gravação</SelectItem>
                      <SelectItem value="recovered" className="text-xs">Eventos de recuperação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </details>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-[hsl(var(--muted))] px-3 py-2">
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{selected.size} selecionados</span>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors">
                  <CheckCheck className="w-3.5 h-3.5" />
                  Reconhecer
                </button>
                <button onClick={() => setSelected(new Set())} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-[hsl(var(--accent))] transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence>
              {pageData.map(evt => {
                const isActive = current?.id === evt.id;
                return (
                  <motion.button
                    key={evt.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setDrawerEvent(evt)}
                    className={`w-full text-left rounded-2xl border px-3 py-3 transition-all ${isActive ? 'border-[hsl(var(--primary)_/_0.35)] bg-[hsl(var(--primary)_/_0.06)]' : 'border-border bg-background hover:bg-[hsl(var(--accent))]'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] ${SEV_STYLES[evt.severity]}`}>
                          {severityLabel(evt.severity)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold truncate">{EVENT_TYPE_LABELS[evt.type] ?? evt.type}</div>
                            <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">{evt.cameraName}</div>
                          </div>
                          <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                          <span>{format(new Date(evt.timestamp), 'HH:mm:ss')}</span>
                          <span>•</span>
                          <span>{evt.acknowledged ? 'Reconhecido' : 'Aberto'}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-card">
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] disabled:opacity-40 hover:bg-[hsl(var(--accent))] transition-colors">Anterior</button>
              <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] disabled:opacity-40 hover:bg-[hsl(var(--accent))] transition-colors">Próximo</button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4 min-h-0 flex-1">
            <div className="rounded-2xl border border-card-border bg-card overflow-hidden min-h-0 flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <h3 className="mt-1 text-[16px] font-semibold tracking-tight">{current ? EVENT_TYPE_LABELS[current.type] ?? current.type : 'Sem seleção'}</h3>
                  <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">{current?.description ?? 'Selecione um alerta para visualizar o contexto da câmera.'}</div>
                </div>
                <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] ${current ? SEV_STYLES[current.severity] : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border'}`}>
                  {current ? severityLabel(current.severity) : '—'}
                </span>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Horário', current ? format(new Date(current.timestamp), 'dd/MM/yyyy HH:mm:ss') : '—'],
                    ['Câmera', current?.cameraName ?? '—'],
                    ['Zona', currentCamera?.zone ?? '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-border bg-[hsl(var(--muted))] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{k}</div>
                      <div className="mt-1 text-[12px] font-medium truncate">{v}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border bg-background overflow-hidden">
                  <div className="relative aspect-video bg-[hsl(220_20%_7%)] overflow-hidden">
                    <div className="absolute inset-0 opacity-70" style={{ background: 'linear-gradient(180deg, hsl(220 20% 9% / 0.95), hsl(220 20% 6% / 1))' }} />
                    <div className="absolute inset-0 opacity-25 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:24px_24px]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Video className="w-9 h-9 mx-auto text-[hsl(var(--primary))] opacity-80" />
                        <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Visualização da câmera</div>
                        <div className="mt-1 text-[12px] font-semibold">{currentCamera?.code ?? 'CAM-000'}</div>
                      </div>
                    </div>
                    <div className="absolute left-3 top-3 flex items-center gap-2 text-[9px] text-white/70">
                      <span className="rounded bg-black/45 px-1.5 py-0.5">REC</span>
                      <span className="rounded bg-black/45 px-1.5 py-0.5">UTC+0</span>
                    </div>
                    <div className="absolute left-3 bottom-3 text-[10px] text-white/60">{current?.cameraName ?? 'Sem câmera'}</div>
                    <div className="absolute right-3 bottom-3 text-[10px] text-white/60">{current ? format(new Date(current.timestamp), 'HH:mm:ss') : '--:--:--'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Severidade', value: current ? severityLabel(current.severity) : '—' },
                    { label: 'Status', value: current?.acknowledged ? 'Reconhecido' : 'Aberto' },
                    { label: 'Evento', value: current?.type.replace(/_/g, ' ') ?? '—' },
                  ].map(card => (
                    <div key={card.label} className="rounded-xl border border-border px-3 py-2 bg-[hsl(var(--muted))]">
                      <div className="text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{card.label}</div>
                      <div className="mt-1 text-[11px] font-medium truncate">{card.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-card-border bg-card overflow-hidden min-h-0 flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Contexto da câmera</div>
                  <h3 className="mt-1 text-[14px] font-semibold">{currentCamera?.name ?? 'Câmera associada'}</h3>
                </div>
                <button onClick={() => currentCamera && setLocation('/live')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir ao vivo
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="rounded-2xl border border-border bg-[hsl(var(--muted))] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold">{currentCamera?.name ?? 'Câmera indisponível'}</div>
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{currentCamera?.zone ?? 'Zona não encontrada'}</div>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border ${currentCamera?.isOnline ? 'bg-[hsl(152_36%_45%_/_0.12)] text-[hsl(152_36%_55%)] border-[hsl(152_36%_45%_/_0.25)]' : 'bg-[hsl(var(--destructive)_/_0.12)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.25)]'}`}>
                      {currentCamera?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <details className="rounded-xl border border-border bg-background px-3 py-2 text-[10px]">
                    <summary className="cursor-pointer text-[hsl(var(--muted-foreground))]">Detalhes da câmera</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        ['Código', currentCamera?.code ?? '—'],
                        ['Modelo', currentCamera?.model ?? '—'],
                        ['Resolução', currentCamera?.resolution ?? '—'],
                        ['FPS', currentCamera ? `${currentCamera.fps}` : '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-card border border-border px-3 py-2">
                          <div className="text-[hsl(var(--muted-foreground))]">{k}</div>
                          <div className="mt-1 font-medium truncate">{v}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>

                <div className="rounded-2xl border border-border overflow-hidden bg-[hsl(220_20%_7%)]">
                  <div className="aspect-video relative">
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(220_20%_10%_/_0.15),hsl(220_20%_4%_/_0.75))]" />
                    <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:28px_28px]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Shield className="w-10 h-10 mx-auto text-[hsl(var(--primary))] opacity-80" />
                        <div className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">Preview da câmera</div>
                      </div>
                    </div>
                    <div className="absolute left-3 top-3 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/70">Ao vivo</div>
                    <div className="absolute right-3 top-3 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/70">Gravando</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                    <Clock className="w-3.5 h-3.5" />
                    Linha do evento
                  </div>
                  <div className="space-y-3">
                    {[
                      'Alerta capturado pelo analítico da câmera.',
                      'Correlação automática com zona e severidade.',
                      current?.acknowledged ? 'Evento já reconhecido pelo operador.' : 'Evento aguardando reconhecimento.',
                    ].map((line, i) => (
                      <div key={line} className="flex items-start gap-2">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] shrink-0" />
                        <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{i === 0 ? `${current ? format(new Date(current.timestamp), 'HH:mm:ss') : '--:--:--'} — ` : ''}{line}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 h-9 rounded-xl bg-[hsl(var(--primary)_/_0.12)] border border-[hsl(var(--primary)_/_0.28)] text-[hsl(var(--primary))] text-[11px] hover:bg-[hsl(var(--primary)_/_0.16)] transition-colors flex items-center justify-center gap-2">
                    <CheckCheck className="w-4 h-4" />
                    Reconhecer
                  </button>
                  <button className="flex-1 h-9 rounded-xl border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors flex items-center justify-center gap-2">
                    <Archive className="w-4 h-4" />
                    Evidência
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
