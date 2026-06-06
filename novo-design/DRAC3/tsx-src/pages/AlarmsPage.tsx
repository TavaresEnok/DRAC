import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Bell, BellOff, CheckCheck, ChevronUp, ChevronDown,
  AlertTriangle, Flame, DoorOpen, Shield, MapPin,
  Volume2, VolumeX, ArrowRight, X, Clock, Settings2, Plus, Play, Pencil, Trash2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { useAlarmStore } from '../store/alarmStore';
import { useAuthStore } from '../store/authStore';
import { Alarm, Camera } from '../store/vmsDataStore';
import { getApiBaseUrl } from '../lib/api-base';

const PRIORITY_STYLES: Record<string, { badge: string; iconBg: string }> = {
  P1: {
    badge: 'bg-[hsl(354_52%_52%_/_0.12)] text-[hsl(354,52%,68%)] border-[hsl(354_52%_52%_/_0.35)]',
    iconBg: 'bg-[hsl(354_52%_52%_/_0.10)] text-[hsl(354,52%,65%)]',
  },
  P2: {
    badge: 'bg-[hsl(22_60%_54%_/_0.12)]  text-[hsl(22,60%,68%)]  border-[hsl(22_60%_54%_/_0.35)]',
    iconBg: 'bg-[hsl(22_60%_54%_/_0.10)]  text-[hsl(22,60%,65%)]',
  },
  P3: {
    badge: 'bg-[hsl(38_58%_54%_/_0.12)]  text-[hsl(38,58%,68%)]  border-[hsl(38_58%_54%_/_0.35)]',
    iconBg: 'bg-[hsl(38_58%_54%_/_0.10)]  text-[hsl(38,58%,65%)]',
  },
  P4: {
    badge: 'bg-[hsl(213_65%_57%_/_0.10)] text-[hsl(213,65%,70%)] border-[hsl(213_65%_57%_/_0.28)]',
    iconBg: 'bg-[hsl(213_65%_57%_/_0.10)] text-[hsl(213,65%,68%)]',
  },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  intrusion: Shield,
  fire: Flame,
  access_violation: DoorOpen,
  camera_tampering: AlertTriangle,
  perimeter_breach: MapPin,
  panic_button: AlertTriangle,
  loitering: Clock,
};

type AlarmRule = {
  id: string;
  name: string;
  source: 'MOTION' | 'STREAM' | 'HEALTH' | 'ANALYTICS';
  eventType: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  isEnabled: boolean;
  dedupWindowSeconds: number;
  autoResolveOnRecovery: boolean;
  notifyOnOpen: boolean;
  webhookUrl: string | null;
  emailTo: string | null;
  createdAt: string;
  updatedAt: string;
};

type RuleFormState = {
  id?: string;
  name: string;
  source: AlarmRule['source'];
  eventType: string;
  priority: AlarmRule['priority'];
  dedupWindowSeconds: number;
  autoResolveOnRecovery: boolean;
  notifyOnOpen: boolean;
  webhookUrl: string;
  emailTo: string;
  isEnabled: boolean;
};

type AlarmApiItem = {
  id: string;
  cameraId: string;
  cameraName?: string | null;
  source: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'OPEN' | 'ACKED' | 'RESOLVED';
  note?: string | null;
  occurredAt: string;
  acknowledgedAt?: string | null;
  acknowledgedByUserName?: string | null;
  lastNotificationStatus?: string | null;
  notificationDelivery?: Array<Record<string, unknown>>;
  transitionHistory?: Array<Record<string, unknown>>;
  isSnoozed?: boolean;
  snoozedUntil?: string | null;
  occurrenceCount?: number;
  occurredAt?: string;
};

const API_URL = getApiBaseUrl();
const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 4,
  fontSize: 11,
  color: 'hsl(var(--foreground))',
};

const P_COLORS: Record<string, string> = {
  P1: 'hsl(354,52%,52%)',
  P2: 'hsl(22,60%,54%)',
  P3: 'hsl(38,58%,54%)',
  P4: 'hsl(213,65%,57%)',
};

const ALARM_SOURCE_LABELS: Record<AlarmRule['source'], string> = {
  MOTION: 'Movimento',
  STREAM: 'Vídeo',
  HEALTH: 'Saúde',
  ANALYTICS: 'Análise',
};

const EMPTY_RULE_FORM: RuleFormState = {
  name: '',
  source: 'MOTION',
  eventType: '',
  priority: 'P3',
  dedupWindowSeconds: 30,
  autoResolveOnRecovery: true,
  notifyOnOpen: true,
  webhookUrl: '',
  emailTo: '',
  isEnabled: true,
};

function AlarmCard({ alarm, onAck, onResolve, onAddNote }: { alarm: Alarm; onAck: () => void; onResolve: () => void; onAddNote?: (note: string) => void }) {
  const [expanded, setExpanded] = useState(alarm.priority === 'P1');
  const [noteInput, setNoteInput] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const ps = PRIORITY_STYLES[alarm.priority];
  const Icon = TYPE_ICONS[alarm.type] ?? AlertTriangle;
  const isActiveP1 = alarm.priority === 'P1' && alarm.status === 'active';
  const statusLabel = alarm.status === 'active' ? 'Aberto' : alarm.status === 'acknowledged' ? 'Reconhecido' : 'Resolvido';

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
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded((e) => !e)}>
        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${ps.iconBg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${ps.badge}`}>{alarm.priority}</span>
            <span className="text-[12px] font-semibold truncate">{alarm.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{alarm.zone}</span>
            <span className="text-[hsl(var(--border))]">·</span>
            <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums">{format(new Date(alarm.triggeredAt), 'HH:mm:ss')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
            alarm.status === 'active'
              ? 'bg-[hsl(354_52%_52%_/_0.09)] text-[hsl(354,52%,65%)] border-[hsl(354_52%_52%_/_0.28)]'
              : alarm.status === 'acknowledged'
                ? 'bg-[hsl(38_58%_54%_/_0.09)]  text-[hsl(38,58%,65%)]  border-[hsl(38_58%_54%_/_0.28)]'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border'
          }`}>
            {statusLabel}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" /> : <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="px-4 pb-3 border-t border-border pt-3 space-y-3">
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">{alarm.description}</p>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                <span>Ocorrências agrupadas: {alarm.occurrenceCount ?? 1}</span>
                <span>Última ocorrência: {alarm.lastOccurredAt ? format(new Date(alarm.lastOccurredAt), 'HH:mm:ss') : format(new Date(alarm.triggeredAt), 'HH:mm:ss')}</span>
              </div>
              {alarm.notes && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notas</p>
                  {alarm.notes.split('\n').map((n, i) => (
                    <p key={i} className="text-[11px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-3 py-1.5 rounded">{n}</p>
                  ))}
                </div>
              )}
              {alarm.lastNotificationStatus && alarm.lastNotificationStatus !== 'DELIVERED' && (
                <div className="rounded border border-[hsl(354_52%_52%_/_0.35)] bg-[hsl(354_52%_52%_/_0.10)] px-3 py-2">
                  <p className="text-[10px] font-semibold text-[hsl(354,52%,65%)] uppercase tracking-wider">Notificação com falha</p>
                  <p className="text-[11px] text-[hsl(354,52%,72%)] mt-1">
                    Último status: {alarm.lastNotificationStatus}
                  </p>
                </div>
              )}
              {Array.isArray(alarm.notificationDelivery) && alarm.notificationDelivery.length > 0 && (
                <details className="space-y-1.5 rounded border border-border bg-background/45 px-3 py-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">Entrega de notificações</summary>
                  <div className="space-y-1">
                    {alarm.notificationDelivery.slice(-4).reverse().map((delivery, idx) => {
                      const channel = String(delivery?.channel ?? '-').toUpperCase();
                      const status = String(delivery?.status ?? '-').toUpperCase();
                      const reason = typeof delivery?.reason === 'string' ? delivery.reason : '';
                      const at = typeof delivery?.at === 'string' ? delivery.at : '';
                      const attempt = typeof delivery?.attempt === 'number' ? delivery.attempt : null;
                      const tone = status === 'DELIVERED'
                        ? 'border-[hsl(152_46%_44%_/_0.3)] bg-[hsl(152_46%_44%_/_0.1)] text-[hsl(152_46%_55%)]'
                        : status === 'SKIPPED'
                          ? 'border-[hsl(38_58%_54%_/_0.3)] bg-[hsl(38_58%_54%_/_0.1)] text-[hsl(38_58%_58%)]'
                          : 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))]';
                      return (
                        <div key={`${channel}-${status}-${idx}`} className={`rounded border px-2 py-1 text-[10px] ${tone}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span>{channel} · {status}</span>
                            <span className="font-mono">{at ? format(new Date(at), 'HH:mm:ss') : '--:--:--'}</span>
                          </div>
                          {(attempt != null || reason) && (
                            <div className="mt-0.5 text-[9px] opacity-90">
                              {attempt != null ? `tentativa ${attempt}` : ''}
                              {attempt != null && reason ? ' · ' : ''}
                              {reason || ''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
              {showNoteInput && (
                <div className="flex gap-2">
                  <input
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Adicionar nota..."
                    className="flex-1 h-8 px-3 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && noteInput.trim()) {
                        onAddNote?.(noteInput.trim());
                        setNoteInput('');
                        setShowNoteInput(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (noteInput.trim()) {
                        onAddNote?.(noteInput.trim());
                        setNoteInput('');
                        setShowNoteInput(false);
                      }
                    }}
                    className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs"
                  >
                    Adicionar
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                {alarm.status === 'active' && (
                  <button onClick={onAck} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors">
                    <CheckCheck className="w-3 h-3" />
                    Reconhecer
                  </button>
                )}
                {alarm.status !== 'resolved' && (
                  <button onClick={onResolve} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--primary)_/_0.08)] border border-[hsl(var(--primary)_/_0.25)] text-[hsl(var(--primary))] text-[11px] hover:bg-[hsl(var(--primary)_/_0.13)] transition-colors">
                    <X className="w-3 h-3" />
                    Resolver
                  </button>
                )}
                <button onClick={() => setShowNoteInput((s) => !s)} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[11px] hover:bg-[hsl(var(--accent))] transition-colors">
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
  const { cameras, load } = useAlarmStore();
  const { accessToken } = useAuthStore();
  const [muted, setMuted] = useState(false);
  const [alarmItems, setAlarmItems] = useState<Alarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(false);
  const [alarmsError, setAlarmsError] = useState<string | null>(null);
  const [cameraFilter, setCameraFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'ACKED' | 'RESOLVED'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'P1' | 'P2' | 'P3' | 'P4'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'CRITICAL' | 'WARNING' | 'INFO'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'MOTION' | 'STREAM' | 'HEALTH' | 'ANALYTICS'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [rules, setRules] = useState<AlarmRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [savingRule, setSavingRule] = useState(false);
  const [deletingAllAlarms, setDeletingAllAlarms] = useState(false);
  const [simCameraId, setSimCameraId] = useState('');
  const [simSeverity, setSimSeverity] = useState('WARNING');
  const [runningSimulationId, setRunningSimulationId] = useState<string | null>(null);

  const client = useMemo(() => axios.create({
    baseURL: API_URL,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  }), [accessToken]);

  function mapApiAlarm(raw: AlarmApiItem): Alarm {
    return {
      id: raw.id,
      name: raw.title || `${raw.type} — ${raw.cameraName ?? 'Câmera'}`,
      type: raw.type,
      status: raw.status === 'RESOLVED' ? 'resolved' : raw.status === 'ACKED' ? 'acknowledged' : 'active',
      priority: raw.priority,
      triggeredAt: raw.occurredAt,
      acknowledgedAt: raw.acknowledgedAt ?? undefined,
      acknowledgedBy: raw.acknowledgedByUserName ?? undefined,
      cameraId: raw.cameraId,
      zone: cameras.find((c) => c.id === raw.cameraId)?.zone ?? 'Sem zona',
      description: raw.message,
      notes: raw.note ?? undefined,
      isSnoozed: Boolean(raw.isSnoozed),
      snoozedUntil: raw.snoozedUntil ?? undefined,
      transitionHistory: Array.isArray(raw.transitionHistory) ? raw.transitionHistory : [],
      notificationDelivery: Array.isArray(raw.notificationDelivery) ? raw.notificationDelivery : [],
      lastNotificationStatus: raw.lastNotificationStatus ?? undefined,
      occurrenceCount: typeof raw.occurrenceCount === 'number' ? raw.occurrenceCount : 1,
      lastOccurredAt: raw.occurredAt ?? raw.acknowledgedAt ?? undefined,
    };
  }

  async function loadAlarmsList() {
    if (!accessToken) return;
    setAlarmsLoading(true);
    setAlarmsError(null);
    try {
      const params: Record<string, string | number> = { limit: 300, offset: 0 };
      if (cameraFilter !== 'all') params.cameraId = cameraFilter;
      if (zoneFilter !== 'all') params.zone = zoneFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (fromFilter) params.from = new Date(fromFilter).toISOString();
      if (toFilter) params.to = new Date(toFilter).toISOString();
      const { data } = await client.get<{ items: AlarmApiItem[] }>('/cameras/alarms', { params });
      const mapped = (Array.isArray(data?.items) ? data.items : []).map(mapApiAlarm);
      setAlarmItems(mapped);
    } catch (error) {
      const msg = axios.isAxiosError(error) ? (error.response?.data?.message || error.message) : 'Falha ao carregar alarmes.';
      setAlarmsError(Array.isArray(msg) ? msg.join(' | ') : String(msg));
    } finally {
      setAlarmsLoading(false);
    }
  }

  useEffect(() => {
    void loadAlarmsList();
  }, [accessToken, cameraFilter, zoneFilter, statusFilter, priorityFilter, severityFilter, sourceFilter, typeFilter, fromFilter, toFilter]);

  const zoneOptions = useMemo(() => ['all', ...Array.from(new Set(cameras.map((camera) => camera.zone))).sort()], [cameras]);

  const typeOptions = useMemo(() => {
    const fromAlarms = alarmItems.map((item) => item.type).filter(Boolean);
    return ['all', ...Array.from(new Set(fromAlarms)).sort()];
  }, [alarmItems]);

  const visibleAlarms = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    if (!query) return alarmItems;
    return alarmItems.filter((alarm) =>
      alarm.name.toLowerCase().includes(query) ||
      alarm.description.toLowerCase().includes(query) ||
      alarm.type.toLowerCase().includes(query) ||
      alarm.zone.toLowerCase().includes(query),
    );
  }, [alarmItems, searchFilter]);

  const alarmStats = Object.entries(visibleAlarms.reduce<Record<string, number>>((acc, alarm) => {
    acc[alarm.zone] = (acc[alarm.zone] ?? 0) + 1;
    return acc;
  }, {})).map(([zone, count]) => ({ zone, count }));

  const activeAlertas = visibleAlarms.filter((a) => a.status === 'active').sort((a, b) => {
    const order = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return order[a.priority] - order[b.priority];
  });
  const ackAlertas = visibleAlarms.filter((a) => a.status === 'acknowledged');
  const resolvedAlertas = visibleAlarms.filter((a) => a.status === 'resolved');

  async function loadRules() {
    if (!accessToken) return;
    setRulesLoading(true);
    setRulesError(null);
    try {
      const { data } = await client.get<{ items: AlarmRule[] }>('/alarms/rules');
      setRules(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      const msg = axios.isAxiosError(error) ? (error.response?.data?.message || error.message) : 'Falha ao carregar regras.';
      setRulesError(Array.isArray(msg) ? msg.join(' | ') : String(msg));
    } finally {
      setRulesLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, [accessToken]);

  async function handleAcknowledgeAlarm(id: string) {
    await client.post(`/cameras/alarms/${id}/ack`, {});
    await loadAlarmsList();
    await load();
  }

  async function handleResolveAlarm(id: string) {
    await client.post(`/cameras/alarms/${id}/resolve`, {});
    await loadAlarmsList();
    await load();
  }

  async function handleAddAlarmNote(id: string, note: string) {
    await client.post(`/cameras/alarms/${id}/note`, { note });
    await loadAlarmsList();
    await load();
  }

  async function handleDeleteAllAlarms() {
    const confirmed = window.confirm('Apagar todos os alertas do sistema? Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    setDeletingAllAlarms(true);
    try {
      await client.delete('/cameras/alarms');
      setAlarmItems([]);
      await loadAlarmsList();
      await load();
    } catch (error) {
      const msg = axios.isAxiosError(error) ? (error.response?.data?.message || error.message) : 'Falha ao apagar alertas.';
      window.alert(Array.isArray(msg) ? msg.join(' | ') : String(msg));
    } finally {
      setDeletingAllAlarms(false);
    }
  }

  function openCreateRule() {
    setRuleForm(EMPTY_RULE_FORM);
    setShowRuleForm(true);
  }

  function openEditRule(rule: AlarmRule) {
    setRuleForm({
      id: rule.id,
      name: rule.name,
      source: rule.source,
      eventType: rule.eventType,
      priority: rule.priority,
      dedupWindowSeconds: rule.dedupWindowSeconds,
      autoResolveOnRecovery: rule.autoResolveOnRecovery,
      notifyOnOpen: rule.notifyOnOpen,
      webhookUrl: rule.webhookUrl ?? '',
      emailTo: rule.emailTo ?? '',
      isEnabled: rule.isEnabled,
    });
    setShowRuleForm(true);
  }

  async function saveRule() {
    if (!ruleForm.name.trim() || !ruleForm.eventType.trim()) return;
    setSavingRule(true);
    try {
      const payload = {
        name: ruleForm.name.trim(),
        source: ruleForm.source,
        eventType: ruleForm.eventType.trim().toUpperCase(),
        priority: ruleForm.priority,
        dedupWindowSeconds: Number(ruleForm.dedupWindowSeconds),
        autoResolveOnRecovery: ruleForm.autoResolveOnRecovery,
        notifyOnOpen: ruleForm.notifyOnOpen,
        webhookUrl: ruleForm.webhookUrl.trim() || undefined,
        emailTo: ruleForm.emailTo.trim() || undefined,
        isEnabled: ruleForm.isEnabled,
      };

      if (ruleForm.id) {
        await client.patch(`/alarms/rules/${ruleForm.id}`, payload);
        await client.patch(`/alarms/rules/${ruleForm.id}/enabled`, { isEnabled: ruleForm.isEnabled });
      } else {
        await client.post('/alarms/rules', payload);
      }

      setShowRuleForm(false);
      await loadRules();
    } catch (error) {
      const msg = axios.isAxiosError(error) ? (error.response?.data?.message || error.message) : 'Falha ao salvar regra.';
      window.alert(Array.isArray(msg) ? msg.join(' | ') : String(msg));
    } finally {
      setSavingRule(false);
    }
  }

  async function toggleRuleEnabled(rule: AlarmRule) {
    try {
      await client.patch(`/alarms/rules/${rule.id}/enabled`, { isEnabled: !rule.isEnabled });
      await loadRules();
    } catch {
      window.alert('Não foi possível alterar o status da regra.');
    }
  }

  async function runSimulation(rule: AlarmRule) {
    const cameraId = simCameraId || cameras[0]?.id;
    if (!cameraId) {
      window.alert('Selecione uma câmera para simular.');
      return;
    }

    setRunningSimulationId(rule.id);
    try {
      await client.post(`/alarms/rules/${rule.id}/simulate`, {
        cameraId,
        eventType: rule.eventType,
        severity: simSeverity,
        message: `Simulação manual da regra ${rule.name}`,
      });
      await load();
      window.alert('Simulação executada com sucesso.');
    } catch {
      window.alert('Falha ao simular regra.');
    } finally {
      setRunningSimulationId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-0">
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${activeAlertas.length > 0 ? 'status-alarm rec-pulse' : 'status-online'}`} />
            <span className="text-[13px] font-semibold">
              {activeAlertas.length > 0 ? `${activeAlertas.length} Alarme${activeAlertas.length !== 1 ? 's' : ''} Ativo${activeAlertas.length !== 1 ? 's' : ''}` : 'Tudo normal'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteAllAlarms}
              disabled={deletingAllAlarms || visibleAlarms.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--destructive)_/_0.35)] text-[hsl(var(--destructive))] text-[11px] transition-colors hover:bg-[hsl(var(--destructive)_/_0.08)] disabled:opacity-45"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deletingAllAlarms ? 'Apagando...' : 'Apagar todos'}
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
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
        </div>

        <details className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <summary className="cursor-pointer text-[12px] font-semibold">Filtros avançados</summary>
          <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
            <select value={cameraFilter} onChange={(e) => setCameraFilter(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="all">Todas as câmeras</option>
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>{camera.name}</option>
              ))}
            </select>
            <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              {zoneOptions.map((zone) => (
                <option key={zone} value={zone}>{zone === 'all' ? 'Todas as zonas' : zone}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="all">Todos os status</option>
              <option value="OPEN">Abertos</option>
              <option value="ACKED">Reconhecidos</option>
              <option value="RESOLVED">Resolvidos</option>
            </select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="all">Todas prioridades</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="all">Todas severidades</option>
              <option value="CRITICAL">Crítica</option>
              <option value="WARNING">Atenção</option>
              <option value="INFO">Informativa</option>
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="all">Todas as fontes</option>
              <option value="MOTION">Movimento</option>
              <option value="STREAM">Vídeo</option>
              <option value="HEALTH">Saúde</option>
              <option value="ANALYTICS">Análise</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              {typeOptions.map((type) => (
                <option key={type} value={type}>{type === 'all' ? 'Todos os tipos' : type}</option>
              ))}
            </select>
            <input type="datetime-local" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs" />
            <input type="datetime-local" value={toFilter} onChange={(e) => setToFilter(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Buscar por nome, tipo, zona ou descrição..." className="h-8 px-3 rounded border border-border bg-background text-xs flex-1" />
            <button onClick={() => void loadAlarmsList()} className="h-8 px-3 rounded border border-border text-xs">Atualizar alarmes</button>
          </div>
          {(alarmsLoading || alarmsError) && (
            <div className="text-[11px]">
              {alarmsLoading && <span className="text-muted-foreground">Carregando alarmes...</span>}
              {alarmsError && <span className="text-[hsl(354,52%,62%)]">{alarmsError}</span>}
            </div>
          )}
          </div>
        </details>

        <details className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <summary className="cursor-pointer text-[12px] font-semibold">Regras e simulação</summary>
          <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[12px] font-semibold">
              <Settings2 className="w-4 h-4" />
              Regras de Alarme
            </div>
            <button onClick={openCreateRule} className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nova regra
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <select value={simCameraId} onChange={(e) => setSimCameraId(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="">Câmera padrão (primeira)</option>
              {cameras.map((camera: Camera) => (
                <option key={camera.id} value={camera.id}>{camera.name}</option>
              ))}
            </select>
            <select value={simSeverity} onChange={(e) => setSimSeverity(e.target.value)} className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="INFO">Informativa</option>
              <option value="WARNING">Atenção</option>
              <option value="CRITICAL">Crítica</option>
            </select>
            <button onClick={() => void loadRules()} className="h-8 px-3 rounded border border-border text-xs">Atualizar regras</button>
            {rulesLoading && <span className="text-[11px] text-muted-foreground">Carregando...</span>}
            {rulesError && <span className="text-[11px] text-[hsl(354,52%,62%)]">{rulesError}</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-[hsl(var(--muted-foreground))]">
                  {['Nome', 'Origem', 'Evento', 'Prioridade', 'Dedup(s)', 'Notificação', 'Status', 'Ações'].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-2 py-2 font-medium">{rule.name}</td>
                    <td className="px-2 py-2">{ALARM_SOURCE_LABELS[rule.source] ?? rule.source}</td>
                    <td className="px-2 py-2 text-muted-foreground">{rule.eventType}</td>
                    <td className="px-2 py-2"><span className={`font-mono px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[rule.priority].badge}`}>{rule.priority}</span></td>
                    <td className="px-2 py-2">{rule.dedupWindowSeconds}</td>
                    <td className="px-2 py-2">{rule.notifyOnOpen ? 'Ativa' : 'Desativada'}</td>
                    <td className="px-2 py-2">{rule.isEnabled ? 'Habilitada' : 'Desabilitada'}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditRule(rule)} className="h-7 px-2 rounded border border-border inline-flex items-center gap-1"><Pencil className="w-3 h-3" />Editar</button>
                        <button onClick={() => void toggleRuleEnabled(rule)} className="h-7 px-2 rounded border border-border">{rule.isEnabled ? 'Desabilitar' : 'Habilitar'}</button>
                        <button onClick={() => void runSimulation(rule)} disabled={runningSimulationId === rule.id} className="h-7 px-2 rounded border border-border inline-flex items-center gap-1 disabled:opacity-50">
                          <Play className="w-3 h-3" />Simular
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!rules.length && !rulesLoading && (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">Nenhuma regra cadastrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </details>

        {activeAlertas.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[hsl(354,52%,62%)] flex items-center gap-2">
              <Bell className="w-3 h-3" />Ativos ({activeAlertas.length})
            </div>
            <AnimatePresence>
              {activeAlertas.map((alarm) => (
                <AlarmCard key={alarm.id} alarm={alarm} onAck={() => void handleAcknowledgeAlarm(alarm.id)} onResolve={() => void handleResolveAlarm(alarm.id)} onAddNote={(note) => void handleAddAlarmNote(alarm.id, note)} />
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

        {ackAlertas.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))] flex items-center gap-2">
              <CheckCheck className="w-3 h-3" />Reconhecidos ({ackAlertas.length})
            </div>
            {ackAlertas.slice(0, 5).map((alarm) => (
              <AlarmCard key={alarm.id} alarm={alarm} onAck={() => void handleAcknowledgeAlarm(alarm.id)} onResolve={() => void handleResolveAlarm(alarm.id)} onAddNote={(note) => void handleAddAlarmNote(alarm.id, note)} />
            ))}
          </div>
        )}

        {resolvedAlertas.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Resolvidos ({resolvedAlertas.length})</div>
            <div className="bg-card border border-card-border rounded-lg overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border">
                    {['Prioridade', 'Nome', 'Zona', 'Resolvido por', 'Disparado em'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[hsl(var(--muted-foreground))]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resolvedAlertas.slice(0, 10).map((alarm) => (
                    <tr key={alarm.id} className="hover:bg-[hsl(var(--accent))] transition-colors">
                      <td className="px-4 py-2.5"><span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[alarm.priority].badge}`}>{alarm.priority}</span></td>
                      <td className="px-4 py-2.5 font-medium">{alarm.name}</td>
                      <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))]">{alarm.zone}</td>
                      <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))] font-mono text-[9px]">{alarm.acknowledgedBy ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))] tabular-nums">{format(new Date(alarm.triggeredAt), 'yyyy-MM-dd HH:mm')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="w-60 border-l border-border bg-card p-4 overflow-y-auto shrink-0 space-y-5">
        <h3 className="text-[12px] font-semibold text-[hsl(var(--muted-foreground))]">Resumo</h3>

        <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Ativos', value: activeAlertas.length, color: 'text-[hsl(354,52%,62%)]' },
              { label: 'Reconh.', value: ackAlertas.length, color: 'text-[hsl(38,58%,60%)]' },
              { label: 'Resolvidos', value: resolvedAlertas.length, color: 'text-[hsl(152,36%,52%)]' },
              { label: 'Total', value: visibleAlarms.length, color: 'text-foreground' },
            ].map((s) => (
            <div key={s.label} className="bg-[hsl(var(--muted))] rounded-lg p-2.5 text-center">
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
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
            {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => {
              const count = visibleAlarms.filter((a) => a.priority === p).length;
              const color = P_COLORS[p];
              return (
                <div key={p} className="flex items-center gap-2">
                  <span className="font-mono text-[9px] w-5 shrink-0" style={{ color }}>{p}</span>
                  <div className="flex-1 h-1 bg-[hsl(var(--border))] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${visibleAlarms.length ? (count / visibleAlarms.length) * 100 : 0}%`, background: color }} />
                  </div>
                  <span className="font-mono text-[9px] text-[hsl(var(--muted-foreground))] w-4 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showRuleForm && (
          <motion.div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} className="w-full max-w-xl bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{ruleForm.id ? 'Editar regra de alarme' : 'Nova regra de alarme'}</h3>
                <button onClick={() => setShowRuleForm(false)} className="h-8 w-8 rounded border border-border inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1 text-xs"><span>Nome da regra</span><input value={ruleForm.name} onChange={(e) => setRuleForm((s) => ({ ...s, name: e.target.value }))} className="w-full h-9 px-3 rounded border border-border bg-background" /></label>
                <label className="space-y-1 text-xs"><span>Evento</span><input value={ruleForm.eventType} onChange={(e) => setRuleForm((s) => ({ ...s, eventType: e.target.value }))} className="w-full h-9 px-3 rounded border border-border bg-background" placeholder="Ex.: movimento_detectado" /></label>
                <label className="space-y-1 text-xs"><span>Origem</span><select value={ruleForm.source} onChange={(e) => setRuleForm((s) => ({ ...s, source: e.target.value as RuleFormState['source'] }))} className="w-full h-9 px-3 rounded border border-border bg-background"><option value="MOTION">Movimento</option><option value="STREAM">Vídeo</option><option value="HEALTH">Saúde</option><option value="ANALYTICS">Análise</option></select></label>
                <label className="space-y-1 text-xs"><span>Prioridade</span><select value={ruleForm.priority} onChange={(e) => setRuleForm((s) => ({ ...s, priority: e.target.value as RuleFormState['priority'] }))} className="w-full h-9 px-3 rounded border border-border bg-background"><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option><option value="P4">P4</option></select></label>
                <label className="space-y-1 text-xs"><span>Deduplicação (segundos)</span><input type="number" min={5} max={3600} value={ruleForm.dedupWindowSeconds} onChange={(e) => setRuleForm((s) => ({ ...s, dedupWindowSeconds: Number(e.target.value) }))} className="w-full h-9 px-3 rounded border border-border bg-background" /></label>
                <label className="space-y-1 text-xs"><span>E-mail destino (opcional)</span><input value={ruleForm.emailTo} onChange={(e) => setRuleForm((s) => ({ ...s, emailTo: e.target.value }))} className="w-full h-9 px-3 rounded border border-border bg-background" placeholder="seguranca@empresa.com" /></label>
                <label className="space-y-1 text-xs md:col-span-2"><span>Webhook (opcional)</span><input value={ruleForm.webhookUrl} onChange={(e) => setRuleForm((s) => ({ ...s, webhookUrl: e.target.value }))} className="w-full h-9 px-3 rounded border border-border bg-background" placeholder="https://seu-webhook.local/alarme" /></label>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleForm.isEnabled} onChange={(e) => setRuleForm((s) => ({ ...s, isEnabled: e.target.checked }))} /> Habilitada</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleForm.autoResolveOnRecovery} onChange={(e) => setRuleForm((s) => ({ ...s, autoResolveOnRecovery: e.target.checked }))} /> Auto-resolver em recuperação</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleForm.notifyOnOpen} onChange={(e) => setRuleForm((s) => ({ ...s, notifyOnOpen: e.target.checked }))} /> Notificar ao abrir</label>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowRuleForm(false)} className="h-9 px-3 rounded border border-border text-xs">Cancelar</button>
                <button onClick={() => void saveRule()} disabled={savingRule || !ruleForm.name.trim() || !ruleForm.eventType.trim()} className="h-9 px-3 rounded bg-primary text-primary-foreground text-xs disabled:opacity-60">{savingRule ? 'Salvando...' : 'Salvar regra'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
