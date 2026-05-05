import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Bell, BellOff, CheckCheck, ChevronUp, ChevronDown,
  AlertTriangle, Flame, DoorOpen, Shield, MapPin,
  Volume2, VolumeX, ArrowRight, X, Clock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { useAlarmStore } from '../store/alarmStore';
import { useAuthStore } from '../store/authStore';
import { Alarm } from '../store/vmsDataStore';

/* Professional priority styles — no neon */
const PRIORITY_STYLES: Record<string, { badge: string; iconBg: string }> = {
  P1: {
    badge:  'bg-[hsl(354_52%_52%_/_0.12)] text-[hsl(354,52%,68%)] border-[hsl(354_52%_52%_/_0.35)]',
    iconBg: 'bg-[hsl(354_52%_52%_/_0.10)] text-[hsl(354,52%,65%)]',
  },
  P2: {
    badge:  'bg-[hsl(22_60%_54%_/_0.12)]  text-[hsl(22,60%,68%)]  border-[hsl(22_60%_54%_/_0.35)]',
    iconBg: 'bg-[hsl(22_60%_54%_/_0.10)]  text-[hsl(22,60%,65%)]',
  },
  P3: {
    badge:  'bg-[hsl(38_58%_54%_/_0.12)]  text-[hsl(38,58%,68%)]  border-[hsl(38_58%_54%_/_0.35)]',
    iconBg: 'bg-[hsl(38_58%_54%_/_0.10)]  text-[hsl(38,58%,65%)]',
  },
  P4: {
    badge:  'bg-[hsl(213_65%_57%_/_0.10)] text-[hsl(213,65%,70%)] border-[hsl(213_65%_57%_/_0.28)]',
    iconBg: 'bg-[hsl(213_65%_57%_/_0.10)] text-[hsl(213,65%,68%)]',
  },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  intrusion:        Shield,
  fire:             Flame,
  access_violation: DoorOpen,
  camera_tampering: AlertTriangle,
  perimeter_breach: MapPin,
  panic_button:     AlertTriangle,
  loitering:        Clock,
};

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 4,
  fontSize: 11,
  color: 'hsl(var(--foreground))',
};

/* Priority bar colors */
const P_COLORS: Record<string, string> = {
  P1: 'hsl(354,52%,52%)',
  P2: 'hsl(22,60%,54%)',
  P3: 'hsl(38,58%,54%)',
  P4: 'hsl(213,65%,57%)',
};

function AlarmCard({ alarm, onAck, onResolve, onAddNote }: { alarm: Alarm; onAck: () => void; onResolve: () => void; onAddNote?: (note: string) => void }) {
  const [expanded, setExpanded] = useState(alarm.priority === 'P1');
  const [noteInput, setNoteInput] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const ps = PRIORITY_STYLES[alarm.priority];
  const Icon = TYPE_ICONS[alarm.type] ?? AlertTriangle;
  const isActiveP1 = alarm.priority === 'P1' && alarm.status === 'active';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`bg-card border rounded-lg overflow-hidden transition-shadow ${
        isActiveP1
          ? 'border-[hsl(354_52%_52%_/_0.4)] alarm-glow'
          : 'border-card-border'
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${ps.iconBg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-bold ${ps.badge}`}>
              {alarm.priority}
            </span>
            <span className="text-[12px] font-semibold truncate">{alarm.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{alarm.zone}</span>
            <span className="text-[hsl(var(--border))]">·</span>
            <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums">
              {format(new Date(alarm.triggeredAt), 'HH:mm:ss')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
            alarm.status === 'active'
              ? 'bg-[hsl(354_52%_52%_/_0.09)] text-[hsl(354,52%,65%)] border-[hsl(354_52%_52%_/_0.28)]'
              : alarm.status === 'acknowledged'
              ? 'bg-[hsl(38_58%_54%_/_0.09)]  text-[hsl(38,58%,65%)]  border-[hsl(38_58%_54%_/_0.28)]'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border'
          }`}>
            {alarm.status.toUpperCase()}
          </span>
          {expanded
            ? <ChevronUp   className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            : <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
          }
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t border-border pt-3 space-y-3">
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">{alarm.description}</p>
              {alarm.notes && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notas</p>
                  {alarm.notes.split('\n').map((n, i) => (
                    <p key={i} className="text-[11px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-3 py-1.5 rounded">
                      {n}
                    </p>
                  ))}
                </div>
              )}
              {showNoteInput && (
                <div className="flex gap-2">
                  <input
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    placeholder="Adicionar nota..."
                    className="flex-1 h-8 px-3 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={e => { if (e.key === 'Enter' && noteInput.trim()) { onAddNote?.(noteInput.trim()); setNoteInput(''); setShowNoteInput(false); } }}
                  />
                  <button onClick={() => { if (noteInput.trim()) { onAddNote?.(noteInput.trim()); setNoteInput(''); setShowNoteInput(false); } }} className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs">Adicionar</button>
                </div>
              )}
              {alarm.acknowledgedBy && (
                <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground)_/_0.7)]">
                  Reconhecido por {alarm.acknowledgedBy} às{' '}
                  {alarm.acknowledgedAt ? format(new Date(alarm.acknowledgedAt), 'HH:mm:ss') : '—'}
                </div>
              )}
              <div className="flex items-center gap-2">
                {alarm.status === 'active' && (
                  <button
                    onClick={onAck}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Reconhecer
                  </button>
                )}
                {alarm.status !== 'resolved' && (
                  <button
                    onClick={onResolve}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--primary)_/_0.08)] border border-[hsl(var(--primary)_/_0.25)] text-[hsl(var(--primary))] text-[11px] hover:bg-[hsl(var(--primary)_/_0.13)] transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Resolver
                  </button>
                )}
                <button onClick={() => setShowNoteInput(s => !s)} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors">
                  {showNoteInput ? 'Cancelar' : '+ Nota'}
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors ml-auto">
                  <ArrowRight className="w-3 h-3" />
                  Ver Câmera
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AlertasPage() {
  const { alarms, acknowledgeAlarm, resolveAlarm, addNote } = useAlarmStore();
  const { user } = useAuthStore();
  const [muted, setMuted] = useState(false);
  const alarmStats = Object.entries(
    alarms.reduce<Record<string, number>>((acc, alarm) => {
      acc[alarm.zone] = (acc[alarm.zone] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([zone, count]) => ({ zone, count }));

  const activeAlertas   = alarms.filter(a => a.status === 'active').sort((a, b) => {
    const order = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return order[a.priority] - order[b.priority];
  });
  const ackAlertas      = alarms.filter(a => a.status === 'acknowledged');
  const resolvedAlertas = alarms.filter(a => a.status === 'resolved');

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-w-0">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${activeAlertas.length > 0 ? 'status-alarm rec-pulse' : 'status-online'}`} />
            <span className="text-[13px] font-semibold">
              {activeAlertas.length > 0
                ? `${activeAlertas.length} Alarme${activeAlertas.length !== 1 ? 's' : ''} Ativo${activeAlertas.length !== 1 ? 's' : ''}`
                : 'Tudo normal'
              }
            </span>
          </div>
          <button
            onClick={() => setMuted(m => !m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] transition-colors ${
              muted
                ? 'border-[hsl(38_58%_54%_/_0.4)] text-[hsl(38,58%,62%)] bg-[hsl(38_58%_54%_/_0.07)]'
                : 'border-border text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'
            }`}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {muted ? 'Ativar som dos alertas' : 'Silenciar alertas'}
          </button>
        </div>

        {/* Active alarms */}
        {activeAlertas.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-[hsl(354,52%,62%)] uppercase tracking-wider flex items-center gap-2">
              <Bell className="w-3 h-3" />
              Ativos ({activeAlertas.length})
            </div>
            <AnimatePresence>
              {activeAlertas.map(alarm => (
                <AlarmCard
                  key={alarm.id}
                  alarm={alarm}
                  onAck={() => acknowledgeAlarm(alarm.id, user?.name ?? 'Desconhecido')}
                  onResolve={() => resolveAlarm(alarm.id)}
                  onAddNote={(note) => addNote(alarm.id, note)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-8 text-center">
            <Bell className="w-7 h-7 text-[hsl(var(--chart-3))] mx-auto mb-3 opacity-60" />
            <div className="text-[13px] font-semibold text-[hsl(var(--chart-3))]">Tudo normal</div>
            <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Não há alarmes ativos</div>
          </div>
        )}

        {/* Acknowledged */}
        {ackAlertas.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-2">
              <CheckCheck className="w-3 h-3" />
              Reconhecidos ({ackAlertas.length})
            </div>
            {ackAlertas.slice(0, 5).map(alarm => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                onAck={() => acknowledgeAlarm(alarm.id, user?.name ?? 'Desconhecido')}
                onResolve={() => resolveAlarm(alarm.id)}
                onAddNote={(note) => addNote(alarm.id, note)}
              />
            ))}
          </div>
        )}

        {/* Resolved table */}
        {resolvedAlertas.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
              Resolvidos ({resolvedAlertas.length})
            </div>
            <div className="bg-card border border-card-border rounded-lg overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border">
                    {['Prioridade','Nome','Zona','Resolvido por','Disparado em'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[hsl(var(--muted-foreground))]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resolvedAlertas.slice(0, 10).map(alarm => (
                    <tr key={alarm.id} className="hover:bg-[hsl(var(--accent))] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[alarm.priority].badge}`}>
                          {alarm.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{alarm.name}</td>
                      <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))]">{alarm.zone}</td>
                      <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))] font-mono text-[9px]">
                        {alarm.acknowledgedBy ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))] tabular-nums">
                        {format(new Date(alarm.triggeredAt), 'yyyy-MM-dd HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats panel ── */}
      <div className="w-60 border-l border-border bg-card p-4 overflow-y-auto shrink-0 space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Estatísticas
        </h3>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Active',   value: activeAlertas.length,  color: 'text-[hsl(354,52%,62%)]' },
            { label: "Ack'd",    value: ackAlertas.length,     color: 'text-[hsl(38,58%,60%)]' },
            { label: 'Resolvidos', value: resolvedAlertas.length, color: 'text-[hsl(152,36%,52%)]' },
            { label: 'Total',    value: alarms.length,         color: 'text-foreground' },
          ].map(s => (
            <div key={s.label} className="bg-[hsl(var(--muted))] rounded-lg p-2.5 text-center">
              <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-[hsl(var(--muted-foreground))]">{s.label}</div>
            </div>
          ))}
        </div>

        <div>
                  <h4 className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">Por Zona</h4>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={alarmStats} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="zone" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={50} />
              <ReTooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="hsl(213,65%,52%)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">Por Prioridade</h4>
          <div className="space-y-2">
            {(['P1','P2','P3','P4'] as const).map(p => {
              const count = alarms.filter(a => a.priority === p).length;
              const color = P_COLORS[p];
              return (
                <div key={p} className="flex items-center gap-2">
                  <span className="font-mono text-[9px] w-5 shrink-0" style={{ color }}>{p}</span>
                  <div className="flex-1 h-1 bg-[hsl(var(--border))] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(count / alarms.length) * 100}%`, background: color }}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-[hsl(var(--muted-foreground))] w-4 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
