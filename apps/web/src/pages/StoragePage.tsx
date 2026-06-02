import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { HardDrive, ShieldAlert, Thermometer, Server, RefreshCw, FileText, Cpu, MemoryStick, Activity } from 'lucide-react';
import { useVmsDataStore } from '../store/vmsDataStore';
import { useAuthStore } from '../store/authStore';
import { getApiBaseUrl } from '../lib/api-base';

function Ring({ value }: { value: number }) {
  return (
    <div className="relative h-40 w-40 rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${value}%, hsl(var(--border)) 0)` }}>
      <div className="absolute inset-4 rounded-full bg-card border border-card-border flex flex-col items-center justify-center">
        <div className="text-3xl font-semibold">{value}%</div>
        <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Uso</div>
      </div>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const tone = value >= 95 ? 'bg-[hsl(var(--destructive))]' : value >= 80 ? 'bg-[hsl(var(--chart-4))]' : 'bg-[hsl(var(--primary))]';
  return <div className="h-1.5 rounded-full bg-[hsl(var(--border))] overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${value}%` }} /></div>;
}

export default function MonitoramentoPage() {
  const API_URL = getApiBaseUrl();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const system = useVmsDataStore((state) => state.system);
  const [policyDays, setPolicyDays] = useState(90);
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [analytics, setAnalytics] = useState<{
    summary: { rows: number; totalRecordingsBytes: string; totalClipsBytes: string; totalBytes: string };
    items: Array<{
      cameraId: string;
      cameraName: string;
      day: string;
      recordingsCount: number;
      clipsCount: number;
      recordingsBytes: string;
      clipsBytes: string;
      totalBytes: string;
    }>;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    void axios.get(`${API_URL}/recordings/storage-usage`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        from: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
        to: new Date(`${toDate}T23:59:59.999Z`).toISOString(),
      },
    }).then(({ data }) => {
      if (cancelled) return;
      setAnalytics(data);
    }).catch((error) => {
      if (cancelled) return;
      setAnalytics(null);
      setAnalyticsError(error instanceof Error ? error.message : 'Falha ao carregar analytics de storage.');
    }).finally(() => {
      if (!cancelled) setAnalyticsLoading(false);
    });
    return () => { cancelled = true; };
  }, [API_URL, accessToken, fromDate, toDate]);

  const toGB = (raw: string | number | bigint) => (Number(raw) / 1024 / 1024 / 1024).toFixed(2);
  const volumes = useMemo(() => system ? [
    {
      server: system.server.hostname,
      volume: system.recordingsRoot,
      type: 'Local FS',
      use: system.disk.usagePercent,
      health: system.disk.usagePercent >= 95 ? 'Crítico' : system.disk.usagePercent >= 80 ? 'Aviso' : 'OK',
      temp: 0,
    },
  ] : [], [system]);
  const total = system ? system.disk.totalBytes / 1024 / 1024 / 1024 / 1024 : 0;
  const used = system ? system.disk.usedBytes / 1024 / 1024 / 1024 / 1024 : 0;
  const free = system ? system.disk.freeBytes / 1024 / 1024 / 1024 / 1024 : 0;
  const percent = system?.disk.usagePercent ?? 0;
  const cpuUsage = system ? Math.min(100, Math.round(((system.server.loadAverage[0] ?? 0) / Math.max(system.server.cpuCount, 1)) * 100)) : 0;
  const ramUsage = system ? Math.min(100, Math.round(((system.server.totalMemoryBytes - system.server.freeMemoryBytes) / Math.max(system.server.totalMemoryBytes, 1)) * 100)) : 0;
  const streamCount = cameras.filter((camera) => camera.isOnline).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Armazenamento</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Espaço disponível, retenção e saúde das gravações.</p>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-xs hover:bg-[hsl(var(--accent))] transition-colors">
          <FileText className="w-3.5 h-3.5" /> Política de Retenção
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="bg-card border border-card-border rounded-xl p-5 flex items-center justify-center">
          <Ring value={percent} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-card border border-card-border rounded-xl p-4"><div className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Total</div><div className="mt-2 text-2xl font-semibold">{total.toFixed(1)} TB</div></div>
          <div className="bg-card border border-card-border rounded-xl p-4"><div className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Utilizado</div><div className="mt-2 text-2xl font-semibold">{used.toFixed(1)} TB</div></div>
          <div className="bg-card border border-card-border rounded-xl p-4"><div className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Livre</div><div className="mt-2 text-2xl font-semibold">{free.toFixed(1)} TB</div></div>
        </div>
      </div>
      <details className="rounded-2xl border border-border bg-card shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Diagnóstico do servidor</summary>
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Telemetria</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Carga atual consolidada do servidor.</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="space-y-3">
            {[
              { label: 'CPU', value: cpuUsage, unit: '%', icon: Cpu },
              { label: 'RAM', value: ramUsage, unit: '%', icon: MemoryStick },
              { label: 'Disco', value: percent, unit: '%', icon: HardDrive },
              { label: 'Streams', value: streamCount, unit: '', icon: Activity },
            ].map((metric) => {
              const Icon = metric.icon;
              const pct = metric.unit === '%' ? metric.value : Math.min(100, (metric.value / 200) * 100);
              const barColor = pct > 82 ? 'hsl(354,52%,52%)' : pct > 62 ? 'hsl(38,58%,54%)' : 'hsl(213,68%,57%)';
              return (
                <div key={metric.label} className="grid grid-cols-[18px_56px_1fr_58px] items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{metric.label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
                  </div>
                  <span className="text-right font-mono text-[10px] tabular-nums">{metric.value.toFixed(0)}{metric.unit}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-border/80 bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold">{system?.server.hostname ?? 'Servidor'}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{system?.recordingsRoot ?? '/storage'} · {cameras.length} câmeras</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold">{cpuUsage}% CPU</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{ramUsage}% RAM</div>
              </div>
            </div>
          </div>
        </div>
      </details>
      <details className="bg-card border border-card-border rounded-xl">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Discos e volumes</summary>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Detalhes técnicos de armazenamento</div>
          </div>
          <button className="text-xs flex items-center gap-2 text-[hsl(var(--muted-foreground))] hover:text-foreground transition-colors"><RefreshCw className="w-3.5 h-3.5" /> Atualizar</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3">Servidor</th>
              <th className="text-left px-5 py-3">Disco / Volume</th>
              <th className="text-left px-5 py-3">Tipo</th>
              <th className="text-left px-5 py-3">Uso</th>
              <th className="text-left px-5 py-3">Saúde</th>
              <th className="text-left px-5 py-3">Temp</th>
            </tr>
          </thead>
          <tbody>
            {volumes.map(row => (
              <tr key={row.volume} className="border-b border-border last:border-0">
                <td className="px-5 py-4 font-mono text-xs">{row.server}</td>
                <td className="px-5 py-4 flex items-center gap-2"><HardDrive className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />{row.volume}</td>
                <td className="px-5 py-4 text-xs text-[hsl(var(--muted-foreground))]">{row.type}</td>
                <td className="px-5 py-4 w-72"><div className="space-y-2"><Bar value={row.use} /><div className="text-xs text-[hsl(var(--muted-foreground))]">{row.use}%</div></div></td>
                <td className="px-5 py-4 text-xs"><span className={`px-2 py-1 rounded-full border ${row.health === 'Crítico' ? 'border-[hsl(var(--destructive)_/_0.35)] text-[hsl(var(--destructive))]' : row.health === 'Aviso' ? 'border-[hsl(var(--chart-4)_/_0.35)] text-[hsl(var(--chart-4))]' : 'border-border text-[hsl(var(--primary))]'}`}>{row.health}</span></td>
                <td className="px-5 py-4 text-xs font-mono flex items-center gap-1"><Thermometer className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />{row.temp ? `${row.temp}°C` : 'N/D'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details className="bg-card border border-card-border rounded-xl">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Uso por câmera</summary>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Gravações e clips exportados no período selecionado</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs" />
          </div>
        </div>
        <div className="px-5 py-3 text-xs text-[hsl(var(--muted-foreground))]">
          {analyticsLoading && 'Carregando analytics...'}
          {!analyticsLoading && analyticsError && analyticsError}
          {!analyticsLoading && analytics && (
            <span>
              linhas: {analytics.summary.rows} · gravações: {toGB(analytics.summary.totalRecordingsBytes)} GB · clips: {toGB(analytics.summary.totalClipsBytes)} GB · total: {toGB(analytics.summary.totalBytes)} GB
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3">Dia</th>
                <th className="text-left px-5 py-3">Câmera</th>
                <th className="text-left px-5 py-3">Gravações</th>
                <th className="text-left px-5 py-3">Clips</th>
                <th className="text-left px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.items ?? []).slice(0, 200).map((row) => (
                <tr key={`${row.day}-${row.cameraId}`} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-mono text-xs">{row.day}</td>
                  <td className="px-5 py-3 text-xs">{row.cameraName}</td>
                  <td className="px-5 py-3 text-xs">
                    {row.recordingsCount} arquivo(s) · {toGB(row.recordingsBytes)} GB
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {row.clipsCount} arquivo(s) · {toGB(row.clipsBytes)} GB
                  </td>
                  <td className="px-5 py-3 text-xs font-semibold">{toGB(row.totalBytes)} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Retenção</div>
          <div className="mt-3 text-2xl font-semibold">{policyDays} dias</div>
          <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Período padrão para gravações e eventos.</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Câmeras</div>
          <div className="mt-3 text-2xl font-semibold">{cameras.length}</div>
          <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Base para cálculo de retenção por carga.</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Saúde operacional</div>
          <div className="mt-3 flex items-center gap-2 text-xs"><ShieldAlert className="w-4 h-4 text-[hsl(var(--chart-4))]" /> {volumes.filter((volume) => volume.health !== 'OK').length} volumes em atenção</div>
          <div className="mt-3 flex items-center gap-2 text-xs"><Server className="w-4 h-4 text-[hsl(var(--primary))]" /> {system ? 1 : 0} servidor monitorado</div>
        </div>
      </div>
    </div>
  );
}
