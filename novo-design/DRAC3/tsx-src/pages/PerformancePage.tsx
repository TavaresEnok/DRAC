import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cpu, MemoryStick, HardDrive, Activity, Gauge, RefreshCw,
  Server, Video, Brain, Wifi, ArrowUp, ArrowDown, Minus,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-base';
import { useAuthStore } from '@/store/authStore';
import { useVmsDataStore } from '@/store/vmsDataStore';

const API_URL = getApiBaseUrl();
const HISTORY = 40; // samples in sparkline

type Sample = { cpu: number; ram: number; disk: number };

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-10" />;
  const w = 100, h = 40;
  const max = 100;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (Math.min(v, max) / max) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `0,${h} ${pts.join(' ')} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full">
      <polygon points={area} fill={color} fillOpacity="0.12" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Trend({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (Math.abs(d) < 1) return <span className="inline-flex items-center text-muted-foreground"><Minus className="h-3 w-3" /></span>;
  if (d > 0) return <span className="inline-flex items-center gap-0.5 text-[hsl(38_58%_58%)]"><ArrowUp className="h-3 w-3" />{Math.abs(d)}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-[hsl(152_46%_55%)]"><ArrowDown className="h-3 w-3" />{Math.abs(d)}%</span>;
}

function toneFor(pct: number) {
  if (pct >= 85) return 'hsl(354,52%,52%)';
  if (pct >= 65) return 'hsl(38,58%,54%)';
  return 'hsl(var(--primary))';
}

function fmtUptime(seconds?: number) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PerformancePage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const cameras = useVmsDataStore((s) => s.cameras);
  const system = useVmsDataStore((s) => s.system);
  const load = useVmsDataStore((s) => s.load);

  const [history, setHistory] = useState<Sample[]>([]);
  const [aiHealth, setAiHealth] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [auto, setAuto] = useState(true);
  const tick = useRef(0);

  const cpu = system ? Math.min(100, Math.round(((system.server.loadAverage[0] ?? 0) / Math.max(system.server.cpuCount, 1)) * 100)) : 0;
  const ram = system ? Math.min(100, Math.round(((system.server.totalMemoryBytes - system.server.freeMemoryBytes) / Math.max(system.server.totalMemoryBytes, 1)) * 100)) : 0;
  const disk = system?.disk.usagePercent ?? 0;
  const onlineCams = cameras.filter((c) => c.isOnline).length;
  const aiCams = cameras.filter((c) => c.aiEnabled).length;
  const processors: Record<string, any> = aiHealth?.processors ?? {};
  const runningProc = Object.values(processors).filter((p: any) => p?.running).length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
      if (accessToken) {
        const r = await axios.get(`${API_URL}/ai/health`, { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null);
        if (r) setAiHealth(r.data);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  // Sample history whenever system metrics change
  useEffect(() => {
    if (!system) return;
    setHistory((prev) => [...prev, { cpu, ram, disk }].slice(-HISTORY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, accessToken]);

  const cpuHist = history.map((h) => h.cpu);
  const ramHist = history.map((h) => h.ram);
  const diskHist = history.map((h) => h.disk);
  const prev = history.length > 1 ? history[history.length - 2] : { cpu, ram, disk };

  const load1 = system?.server.loadAverage[0] ?? 0;
  const load5 = system?.server.loadAverage[1] ?? 0;
  const load15 = system?.server.loadAverage[2] ?? 0;
  const totalRamGB = system ? (system.server.totalMemoryBytes / 1024 / 1024 / 1024).toFixed(1) : '0';
  const usedRamGB = system ? ((system.server.totalMemoryBytes - system.server.freeMemoryBytes) / 1024 / 1024 / 1024).toFixed(1) : '0';

  const METRICS = [
    { key: 'cpu', label: 'CPU', value: cpu, sub: `${load1.toFixed(2)} carga · ${system?.server.cpuCount ?? '—'} núcleos`, hist: cpuHist, icon: Cpu },
    { key: 'ram', label: 'Memória', value: ram, sub: `${usedRamGB} / ${totalRamGB} GB`, hist: ramHist, icon: MemoryStick },
    { key: 'disk', label: 'Disco', value: disk, sub: system ? `${(system.disk.usedBytes / 1024 ** 4).toFixed(1)} / ${(system.disk.totalBytes / 1024 ** 4).toFixed(1)} TB` : '—', hist: diskHist, icon: HardDrive },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Desempenho</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Carga do servidor, saúde de streams e processadores de IA em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAuto((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${auto ? 'border-[hsl(var(--primary)_/_0.35)] bg-[hsl(var(--primary)_/_0.08)] text-[hsl(var(--primary))]' : 'border-border bg-card text-muted-foreground hover:bg-accent'}`}
          >
            <Activity className="h-3.5 w-3.5" /> {auto ? 'Ao vivo' : 'Pausado'}
          </button>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* ── Primary metrics ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {METRICS.map((m) => {
          const Icon = m.icon;
          const tone = toneFor(m.value);
          return (
            <div key={m.key} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.sub}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color: tone }}>{m.value}<span className="text-base">%</span></div>
                  <div className="mt-1 text-[10px]"><Trend now={m.value} prev={(prev as any)[m.key]} /></div>
                </div>
              </div>
              <div className="mt-3"><Sparkline data={m.hist} color={tone} /></div>
            </div>
          );
        })}
      </div>

      {/* ── Secondary KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Streams ativos', value: `${onlineCams}/${cameras.length}`, icon: Video, hint: 'câmeras online' },
          { label: 'Processadores IA', value: `${runningProc}/${aiCams || 0}`, icon: Brain, hint: 'rodando / habilitados' },
          { label: 'Load average', value: `${load1.toFixed(1)} ${load5.toFixed(1)} ${load15.toFixed(1)}`, icon: Gauge, hint: '1m · 5m · 15m', mono: true },
          { label: 'Uptime', value: fmtUptime(system?.server.uptimeSeconds), icon: Server, hint: system?.server.hostname ?? 'servidor' },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className={`mt-2 text-xl font-semibold ${k.mono ? 'font-mono text-lg' : ''}`}>{k.value}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{k.hint}</div>
            </div>
          );
        })}
      </div>

      {/* ── Stream health table ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">Saúde dos streams</h2>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{cameras.length} câmeras</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Câmera', 'Zona', 'Estado', 'Protocolo', 'IA', 'Processador'].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cameras.map((cam) => {
                const proc = processors[cam.id];
                const procState = !cam.aiEnabled ? '—' : proc?.running ? 'ativo' : 'parado';
                const procTone = procState === 'ativo' ? 'text-[hsl(152_46%_55%)]' : procState === 'parado' ? 'text-[hsl(38_58%_60%)]' : 'text-muted-foreground';
                return (
                  <tr key={cam.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-[12.5px] font-medium">{cam.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{cam.code ?? cam.id}</div>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-muted-foreground">{cam.zone}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${cam.isOnline ? 'bg-[hsl(152_46%_44%)]' : 'bg-muted-foreground/40'}`} />
                        {cam.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground uppercase">
                      {(cam as any).preferredLiveProtocol ?? 'webrtc'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[11px] ${cam.aiEnabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {cam.aiEnabled ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-[11px] font-medium ${procTone}`}>{procState}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!system && (
        <p className="text-center text-xs text-muted-foreground py-4">
          Aguardando métricas do servidor…
        </p>
      )}
    </div>
  );
}
