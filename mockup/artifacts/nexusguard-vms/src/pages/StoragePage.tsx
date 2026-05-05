import { useMemo, useState } from 'react';
import { ChevronRight, HardDrive, ShieldAlert, Thermometer, Server, Gauge, RefreshCw, FileText } from 'lucide-react';
import { MOCK_CAMERAS } from '../data/mockData';

function Ring({ value }: { value: number }) {
  return (
    <div className="relative h-40 w-40 rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${value}%, hsl(var(--border)) 0)` }}>
      <div className="absolute inset-4 rounded-full bg-card border border-card-border flex flex-col items-center justify-center">
        <div className="text-3xl font-semibold">{value}%</div>
        <div className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em]">Usage</div>
      </div>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const tone = value >= 95 ? 'bg-[hsl(var(--destructive))]' : value >= 80 ? 'bg-[hsl(var(--chart-4))]' : 'bg-[hsl(var(--primary))]';
  return <div className="h-1.5 rounded-full bg-[hsl(var(--border))] overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${value}%` }} /></div>;
}

export default function StoragePage() {
  const [policyDays, setPolicyDays] = useState(90);
  const volumes = useMemo(() => [
    { server: 'SRV-VMS-01', volume: 'NVMe-01', type: 'NVMe', use: 78, health: 'OK', temp: 38 },
    { server: 'SRV-VMS-01', volume: 'NVMe-02', type: 'NVMe', use: 80, health: 'OK', temp: 39 },
    { server: 'SRV-VMS-01', volume: 'NVMe-03', type: 'NVMe', use: 95, health: 'Aviso', temp: 42 },
    { server: 'SRV-ARCH-01', volume: 'HDD-01', type: 'HDD', use: 95, health: 'Crítico', temp: 45 },
  ], []);
  const total = 28.0;
  const used = 25.3;
  const free = 2.7;
  const percent = 90;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">Sistema &gt; Armazenamento &gt; Armazenamento e Retenção</div>
          <h2 className="text-lg font-semibold">Storage & Retention</h2>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-xs hover:bg-[hsl(var(--accent))] transition-colors">
          <FileText className="w-3.5 h-3.5" /> Políticas de Retenção
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
      <div className="bg-card border border-card-border rounded-xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.16em] uppercase text-[hsl(var(--muted-foreground))]">Discos e Volumes</div>
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
                <td className="px-5 py-4 text-xs font-mono flex items-center gap-1"><Thermometer className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />{row.temp}°C</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Retention Policy</div>
          <div className="mt-3 text-2xl font-semibold">{policyDays} dias</div>
          <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Período padrão para gravações e eventos.</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Cameras Ativas</div>
          <div className="mt-3 text-2xl font-semibold">{MOCK_CAMERAS.length}</div>
          <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Base para cálculo de retenção por carga.</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Storage Health</div>
          <div className="mt-3 flex items-center gap-2 text-xs"><ShieldAlert className="w-4 h-4 text-[hsl(var(--chart-4))]" /> Atenção em 2 volumes</div>
          <div className="mt-3 flex items-center gap-2 text-xs"><Server className="w-4 h-4 text-[hsl(var(--primary))]" /> 2 servidores monitorados</div>
        </div>
      </div>
    </div>
  );
}