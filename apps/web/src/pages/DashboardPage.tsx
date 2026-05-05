import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Camera,
  Cpu,
  HardDrive,
  MemoryStick,
  Radio,
  Server,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subHours } from 'date-fns';
import { useVmsDataStore } from '../store/vmsDataStore';

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-[hsl(354_52%_52%_/_0.12)] text-[hsl(354,52%,68%)] border-[hsl(354_52%_52%_/_0.28)]',
  warning: 'bg-[hsl(38_58%_54%_/_0.12)] text-[hsl(38,58%,68%)] border-[hsl(38_58%_54%_/_0.28)]',
  info: 'bg-[hsl(213_65%_57%_/_0.10)] text-[hsl(213,65%,68%)] border-[hsl(213_65%_57%_/_0.22)]',
};

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  fontSize: 11,
  color: 'hsl(var(--foreground))',
};

export default function PainelPage() {
  const [, setLocation] = useLocation();
  const cameras = useVmsDataStore((state) => state.cameras);
  const events = useVmsDataStore((state) => state.events);
  const alarms = useVmsDataStore((state) => state.alarms);
  const overview = useVmsDataStore((state) => state.overview);
  const system = useVmsDataStore((state) => state.system);
  const hourlyData = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const hour = subHours(new Date(), 23 - i);
      const hourKey = format(hour, 'HH:00');
      const hourEventos = events.filter((event) => format(new Date(event.timestamp), 'HH:00') === hourKey).length;
      const hourAlertas = alarms.filter((alarm) => format(new Date(alarm.triggeredAt), 'HH:00') === hourKey).length;
      return { hour: format(hour, 'HH:mm'), events: hourEventos, alarms: hourAlertas };
    }),
  [events, alarms]);

  const onlineCams = overview?.online ?? cameras.filter(c => c.isOnline).length;
  const offlineCams = overview?.offline ?? cameras.filter(c => !c.isOnline).length;
  const activeAlertas = alarms.filter(a => a.status === 'active');
  const criticalEventos = events.filter(e => e.severity === 'critical').length;
  const unacknowledged = events.filter(e => !e.acknowledged).length;
  const storageHealth = system ? Math.max(100 - system.disk.usagePercent, 0) : 0;
  const recentEventos = events.slice(0, 10);
  const recordingCams = overview?.recordingEnabled ?? cameras.filter(c => c.status === 'recording' || c.status === 'online').length;
  const healthScore = cameras.length ? Math.round((onlineCams / cameras.length) * 100) : 0;
  const cpuUsage = system ? Math.min(100, Math.round(((system.server.loadAverage[0] ?? 0) / Math.max(system.server.cpuCount, 1)) * 100)) : 0;
  const ramUsage = system ? Math.min(100, Math.round(((system.server.totalMemoryBytes - system.server.freeMemoryBytes) / Math.max(system.server.totalMemoryBytes, 1)) * 100)) : 0;
  const diskUsage = system?.disk.usagePercent ?? 0;
  const streamCount = onlineCams;
  const alarmByPriority = [
    { name: 'P1', value: alarms.filter((alarm) => alarm.priority === 'P1').length, color: 'hsl(354,52%,52%)' },
    { name: 'P2', value: alarms.filter((alarm) => alarm.priority === 'P2').length, color: 'hsl(22,60%,54%)' },
    { name: 'P3', value: alarms.filter((alarm) => alarm.priority === 'P3').length, color: 'hsl(38,58%,54%)' },
    { name: 'P4', value: alarms.filter((alarm) => alarm.priority === 'P4').length, color: 'hsl(213,65%,57%)' },
  ];

  return (
    <div className="p-5 space-y-4">
      <section className="ops-card px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[hsl(var(--status-online))]" />
              <h2 className="text-[15px] font-semibold">Site operational posture</h2>
              <span className="ops-chip">
                <span className="w-1.5 h-1.5 rounded-full status-online" />
                ON-PREMISE
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">
              {system ? `${system.server.hostname} · ${cameras.length} câmera(s) cadastrada(s)` : 'Sem resumo de sistema disponível.'}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Health', value: `${healthScore}%`, tone: 'status-online' },
              { label: 'Gravação', value: `${recordingCams}`, tone: 'status-alarm' },
              { label: 'Streams', value: `${streamCount}`, tone: 'status-online' },
              { label: 'Unacked', value: `${unacknowledged}`, tone: activeAlertas.length > 0 ? 'status-warning' : 'status-online' },
            ].map(item => (
              <div key={item.label} className="ops-card-muted min-w-[128px] px-3 py-2">
                <div className="text-[9px] font-mono uppercase tracking-ui text-[hsl(var(--muted-foreground))]">{item.label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${item.tone}`} />
                  <span className="font-mono text-[18px] leading-none tabular-nums">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          label="Cameras online"
          value={`${onlineCams}/${cameras.length}`}
          subtitle={`${offlineCams} feeds require attention`}
          subtext={offlineCams > 0 ? `${offlineCams} feed(s) offline` : 'Todos os feeds operacionais'}
          icon={Camera}
          accent="chart-3"
          index={0}
        />
        <MetricCard
          label="Active alarms"
          value={activeAlertas.length.toString()}
          subtitle={`${activeAlertas.filter(a => a.priority === 'P1').length} P1 critical`}
          subtext="Operator queue is open"
          icon={Bell}
          accent="destructive"
          alert={activeAlertas.length > 0}
          index={1}
        />
        <MetricCard
          label="Critical events"
          value={criticalEventos.toString()}
          subtitle="Last 24 hours"
          subtext={`${unacknowledged} not acknowledged`}
          icon={AlertTriangle}
          accent="chart-2"
          index={2}
        />
        <MetricCard
          label="Armazenamento reserve"
          value={`${storageHealth}%`}
          subtitle={system ? `${(system.disk.freeBytes / 1024 / 1024 / 1024 / 1024).toFixed(2)}TB available` : 'Armazenamento indisponível'}
          subtext={system ? `${(system.disk.usedBytes / 1024 / 1024 / 1024 / 1024).toFixed(2)}TB / ${(system.disk.totalBytes / 1024 / 1024 / 1024 / 1024).toFixed(2)}TB used` : 'Sem métricas'}
          icon={HardDrive}
          accent={storageHealth < 20 ? 'destructive' : 'chart-3'}
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <section className="ops-card xl:col-span-8 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[13px] font-semibold">Event and alarm activity</h3>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Last 24 hours by event ingestion time</p>
            </div>
            <div className="ops-chip">
              <TrendingUp className="w-3 h-3" />
              LIVE TELEMETRY
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={hourlyData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="events-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(213,68%,57%)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="hsl(213,68%,57%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="alarms-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(354,52%,52%)" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="hsl(354,52%,52%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={3} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <ReTooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="events" stroke="hsl(213,68%,57%)" strokeWidth={1.6} fill="url(#events-grad)" name="Eventos" dot={false} />
              <Area type="monotone" dataKey="alarms" stroke="hsl(354,52%,52%)" strokeWidth={1.6} fill="url(#alarms-grad)" name="Alertas" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="ops-card xl:col-span-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[13px] font-semibold">Alarm priority mix</h3>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Open and historical queue</p>
            </div>
            <Bell className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-3">
            <ResponsiveContainer width="100%" height={132}>
              <PieChart>
                <Pie data={alarmByPriority} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" paddingAngle={3}>
                  {alarmByPriority.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <ReTooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {alarmByPriority.map(p => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{p.name}</span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <section className="ops-card xl:col-span-7 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h3 className="text-[13px] font-semibold">Operator event queue</h3>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Newest incidents requiring review</p>
            </div>
            <button
              onClick={() => setLocation('/events')}
              className="ops-button flex items-center gap-1.5 px-3 text-[11px]"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-border/80">
            {recentEventos.map((evt, index) => (
              <motion.div
                key={evt.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-3 px-4 py-2.5 hover:bg-[hsl(var(--accent)_/_0.55)] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  evt.severity === 'critical' ? 'status-alarm' :
                  evt.severity === 'warning' ? 'status-motion' : 'status-online'
                }`} />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium truncate">{evt.cameraName}</div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate capitalize">
                    {evt.type.replace(/_/g, ' ')} / {evt.description}
                  </div>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono capitalize shrink-0 ${SEV_BADGE[evt.severity]}`}>
                  {evt.severity}
                </span>
                <span className="font-mono text-[9px] text-[hsl(var(--muted-foreground))] shrink-0 tabular-nums">
                  {format(new Date(evt.timestamp), 'HH:mm:ss')}
                </span>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="xl:col-span-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">
          <div className="ops-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold">System telemetry</h3>
              <Radio className="w-3.5 h-3.5 text-[hsl(var(--status-online))] rec-pulse" />
            </div>
            <div className="space-y-3">
              {[
                { label: 'CPU', value: cpuUsage, unit: '%', icon: Cpu },
                { label: 'RAM', value: ramUsage, unit: '%', icon: MemoryStick },
                { label: 'Disk', value: diskUsage, unit: '%', icon: HardDrive },
                { label: 'Streams', value: streamCount, unit: '', icon: Activity },
              ].map(m => {
                const Icon = m.icon;
                const pct = m.unit === '%' ? m.value : Math.min(100, (m.value / 200) * 100);
                const barColor = pct > 82 ? 'hsl(354,52%,52%)' : pct > 62 ? 'hsl(38,58%,54%)' : 'hsl(213,68%,57%)';
                return (
                  <div key={m.label} className="grid grid-cols-[18px_54px_1fr_58px] items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{m.label}</span>
                    <div className="h-1.5 bg-[hsl(var(--border)_/_0.7)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
                    </div>
                    <span className="font-mono text-[10px] text-right tabular-nums">{m.value.toFixed(0)}{m.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ops-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold">Server summary</h3>
              <Server className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            </div>
            <div className="space-y-2.5">
              {[{
                id: system?.server.hostname ?? 'server',
                name: system?.server.hostname ?? 'Servidor',
                ip: system?.recordingsRoot ?? '/storage',
                cameras: cameras.length,
                cpu: cpuUsage,
                temp: 0,
                status: system?.status === 'ok' ? 'healthy' : 'warning',
              }].map(srv => (
                <div key={srv.id} className="grid grid-cols-[10px_1fr_42px_42px] items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${srv.status === 'healthy' ? 'status-online' : 'status-warning rec-pulse'}`} />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium truncate">{srv.name}</div>
                    <div className="font-mono text-[9px] text-[hsl(var(--muted-foreground))] truncate">{srv.ip} / {srv.cameras} cams</div>
                  </div>
                  <span className="font-mono text-[10px] text-right tabular-nums">{srv.cpu}%</span>
                  <span className="font-mono text-[10px] text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                    N/D
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
