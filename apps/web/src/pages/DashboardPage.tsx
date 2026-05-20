import { useMemo, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Radio,
  TrendingUp,
} from 'lucide-react';
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

function PanelCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function CompactStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    neutral: 'text-foreground',
    success: 'text-[hsl(var(--status-online))]',
    warning: 'text-[hsl(var(--chart-2))]',
    danger: 'text-[hsl(var(--destructive))]',
  }[tone];

  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function QueueRow({
  title,
  subtitle,
  right,
  tone = 'neutral',
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
}) {
  const dotClass = {
    neutral: 'bg-[hsl(var(--muted-foreground))]',
    warning: 'bg-[hsl(var(--chart-2))]',
    danger: 'bg-[hsl(var(--destructive))]',
    success: 'bg-[hsl(var(--status-online))]',
  }[tone];

  return (
    <div className="grid grid-cols-[10px_1fr_auto] items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 transition-colors hover:bg-background/80">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-foreground">{title}</div>
        <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

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
  const recentHealthEvents = events
    .filter((event) => [
      'HEALTH_CAMERA_OFFLINE',
      'HEALTH_RECORDING_RECOVERED',
      'HEALTH_AUTO_RECOVERED',
      'HEALTH_STREAM_UNAVAILABLE',
      'HEALTH_STREAM_RECOVERED',
      'HEALTH_STREAM_LATENCY_HIGH',
      'HEALTH_STREAM_LATENCY_RECOVERED',
      'HEALTH_STREAM_CODEC_INCOMPATIBLE',
      'HEALTH_STREAM_FPS_DRIFT',
      'HEALTH_STREAM_FPS_RECOVERED',
      'HEALTH_STREAM_FPS_REMEDIATION_REQUESTED',
      'HEALTH_STREAM_FPS_REMEDIATION_SUCCESS',
      'HEALTH_STREAM_FPS_REMEDIATION_FAILED',
    ].includes(event.type))
    .slice(0, 12);
  const recordingCams = overview?.recordingEnabled ?? cameras.filter(c => c.status === 'recording' || c.status === 'online').length;
  const recordingNow = cameras.filter((camera) => camera.status === 'recording').length;
  const cpuUsage = system ? Math.min(100, Math.round(((system.server.loadAverage[0] ?? 0) / Math.max(system.server.cpuCount, 1)) * 100)) : 0;
  const ramUsage = system ? Math.min(100, Math.round(((system.server.totalMemoryBytes - system.server.freeMemoryBytes) / Math.max(system.server.totalMemoryBytes, 1)) * 100)) : 0;
  const diskUsage = system?.disk.usagePercent ?? 0;
  const streamCount = onlineCams;
  const p1Alarms = activeAlertas.filter((a) => a.priority === 'P1').length;
  const alarmByPriority = [
    { name: 'P1', value: alarms.filter((alarm) => alarm.priority === 'P1').length, color: 'hsl(354,52%,52%)' },
    { name: 'P2', value: alarms.filter((alarm) => alarm.priority === 'P2').length, color: 'hsl(22,60%,54%)' },
    { name: 'P3', value: alarms.filter((alarm) => alarm.priority === 'P3').length, color: 'hsl(38,58%,54%)' },
    { name: 'P4', value: alarms.filter((alarm) => alarm.priority === 'P4').length, color: 'hsl(213,65%,57%)' },
  ];
  return (
    <div className="space-y-5 p-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CompactStat
          label="Online"
          value={`${onlineCams}/${cameras.length}`}
          tone={offlineCams > 0 ? 'warning' : 'success'}
        />
        <CompactStat
          label="Alarmes ativos"
          value={String(activeAlertas.length)}
          tone={activeAlertas.length > 0 ? 'danger' : 'success'}
        />
        <CompactStat
          label="Gravando agora"
          value={String(recordingNow)}
          tone={recordingNow > 0 ? 'danger' : 'success'}
        />
        <CompactStat
          label="Disco livre"
          value={`${storageHealth}%`}
          tone={diskUsage >= 85 ? 'danger' : diskUsage >= 70 ? 'warning' : 'success'}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className="space-y-4">
          <PanelCard
            eyebrow="Volume"
            title="Atividade de eventos e alarmes"
            description="Últimas 24 horas."
            action={<span className="ops-chip"><TrendingUp className="h-3 w-3" /> 24h</span>}
          >
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={hourlyData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="events-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(213,68%,57%)" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="hsl(213,68%,57%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="alarms-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(354,52%,52%)" stopOpacity={0.18} />
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
          </PanelCard>

          <PanelCard
            eyebrow="Fila"
            title="Eventos recentes"
            description="Incidentes mais novos que merecem revisão operacional."
            action={
              <button onClick={() => setLocation('/events')} className="ops-button flex items-center gap-1.5 px-3 text-[11px]">
                Ver todos <ArrowRight className="h-3 w-3" />
              </button>
            }
          >
            <div className="space-y-2">
              {recentEventos.slice(0, 8).map((evt, index) => (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.025 }}
                >
                  <QueueRow
                    title={evt.cameraName}
                    subtitle={`${evt.type.replace(/_/g, ' ')} / ${evt.description}`}
                    tone={evt.severity === 'critical' ? 'danger' : evt.severity === 'warning' ? 'warning' : 'success'}
                    right={
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase ${SEV_BADGE[evt.severity]}`}>{evt.severity}</span>
                        <span className="font-mono text-[9px] text-muted-foreground">{format(new Date(evt.timestamp), 'HH:mm:ss')}</span>
                      </div>
                    }
                  />
                </motion.div>
              ))}
            </div>
          </PanelCard>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 self-start">
          <PanelCard
            eyebrow="Mix"
            title="Prioridade de alarmes"
            description="Distribuição atual."
          >
            <div className="grid grid-cols-[132px_1fr] items-center gap-3">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={alarmByPriority} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
                    {alarmByPriority.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <ReTooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {alarmByPriority.map((priority) => (
                  <div key={priority.name} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: priority.color }} />
                    <span className="text-[10px] font-mono text-muted-foreground">{priority.name}</span>
                    <span className="ml-auto font-mono text-[11px] tabular-nums">{priority.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </PanelCard>

          <PanelCard
            eyebrow="Infra"
            title="Telemetria do sistema"
            description="Carga atual."
            action={<Radio className="h-3.5 w-3.5 text-[hsl(var(--status-online))] rec-pulse" />}
          >
            <div className="space-y-3">
              {[
                { label: 'CPU', value: cpuUsage, unit: '%', icon: Cpu },
                { label: 'RAM', value: ramUsage, unit: '%', icon: MemoryStick },
                { label: 'Disco', value: diskUsage, unit: '%', icon: HardDrive },
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
          </PanelCard>

          {recentHealthEvents.length > 0 ? (
            <PanelCard
              eyebrow="Saúde"
              title="Saúde recente"
              description="Últimos eventos de saúde."
            >
              <div className="space-y-2">
                {recentHealthEvents.slice(0, 5).map((evt) => (
                  <QueueRow
                    key={evt.id}
                    title={evt.cameraName}
                    subtitle={evt.type.replace(/_/g, ' ')}
                    tone={evt.severity === 'critical' ? 'danger' : evt.severity === 'warning' ? 'warning' : 'success'}
                    right={<span className="font-mono text-[9px] text-muted-foreground">{format(new Date(evt.timestamp), 'HH:mm:ss')}</span>}
                  />
                ))}
              </div>
            </PanelCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
