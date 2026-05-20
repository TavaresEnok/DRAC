import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  Database,
  FileLock,
  HardDrive,
  Key,
  Lock,
  Moon,
  Plus,
  Save,
  Server,
  Shield,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useThemeStore } from '../store/themeStore';
import { useVmsDataStore } from '../store/vmsDataStore';

const SECTIONS = [
  { id: 'general', label: 'Geral', description: 'Identidade, tema e operação', icon: Shield },
  { id: 'users', label: 'Usuários', description: 'Contas e status de acesso', icon: Users },
  { id: 'profiles', label: 'Permissões', description: 'Perfis e capacidades', icon: FileLock },
  { id: 'storage', label: 'Monitoramento', description: 'Retenção e disco', icon: Database },
  { id: 'alarms', label: 'Alertas', description: 'Notificações e alarmes', icon: Bell },
  { id: 'security', label: 'Segurança', description: 'Sessão, senha e auditoria', icon: Lock },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const ROLE_CAPS = {
  admin: ['Ao Vivo', 'Mural', 'Reprodução', 'Eventos', 'Câmeras', 'PTZ', 'Evidências', 'Configurações'],
  supervisor: ['Ao Vivo', 'Mural', 'Reprodução', 'Eventos', 'Alertas', 'Evidências'],
  operator: ['Ao Vivo', 'Reprodução', 'Eventos'],
} as const;

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex < 2 ? 0 : 1)} ${units[unitIndex]}`;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border/70 bg-card/85 shadow-sm shadow-black/5 ${className}`}>{children}</div>;
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0 md:min-w-[220px] md:justify-self-end">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full border transition-colors ${checked ? 'border-emerald-500/40 bg-emerald-500/20' : 'border-border bg-muted'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border border-border bg-background/70 px-3 text-sm outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 ${props.className ?? ''}`}
    />
  );
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-border bg-background/70 px-3 text-sm outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 ${props.className ?? ''}`}
    />
  );
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'danger' | 'success' | 'warning' }) {
  const toneClass = {
    neutral: 'border-border bg-background text-muted-foreground',
    danger: 'border-red-500/25 bg-red-500/10 text-red-300',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}>{children}</span>;
}

export default function ConfiguraçõesPage() {
  const { theme, setTheme } = useThemeStore();
  const users = useVmsDataStore((state) => state.users);
  const system = useVmsDataStore((state) => state.system);
  const cameras = useVmsDataStore((state) => state.cameras);

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [facilityName, setFacilityName] = useState('Servidor NexusGuard');
  const [siteId, setSiteId] = useState('LOCAL-SITE');
  const [timezone, setTimezone] = useState('UTC+0');
  const [motionRetain, setMotionRetain] = useState(true);
  const [alarmAudio, setAlarmAudio] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState([30]);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState([5]);
  const [retentionDays, setRetentionDays] = useState([90]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!system) return;
    setFacilityName(system.server.hostname);
    setSiteId(system.recordingsRoot);
  }, [system]);

  const metrics = useMemo(() => {
    const online = cameras.filter((camera) => camera.isOnline).length;
    const activeUsers = users.filter((user) => user.active).length;
    const usage = system?.disk.usagePercent ?? 0;
    return {
      online: `${online}/${cameras.length || 0}`,
      activeUsers: `${activeUsers}/${users.length || 0}`,
      disk: usage ? `${Math.round(usage)}%` : '-',
      recordings: String(system?.recordings.count ?? 0),
    };
  }, [cameras, system, users]);

  const retentionZones = useMemo(
    () => Array.from(new Set(cameras.map((camera) => camera.zone).filter(Boolean))).slice(0, 4),
    [cameras],
  );

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,hsl(var(--accent))_0,transparent_32rem)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Sistema</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ajustes essenciais do VMS, organizados para operação rápida e sem ruído visual.</p>
          </div>
          <button
            onClick={handleSave}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
              saved ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : 'bg-foreground text-background hover:bg-foreground/90'
            }`}
            data-testid="button-save-settings"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Salvo' : 'Salvar alterações'}
          </button>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard icon={Server} label="Câmeras online" value={metrics.online} detail="Dispositivos respondendo agora" />
          <MetricCard icon={Users} label="Usuários ativos" value={metrics.activeUsers} detail="Contas liberadas para acesso" />
          <MetricCard icon={HardDrive} label="Uso do disco" value={metrics.disk} detail={`${formatBytes(system?.disk.freeBytes)} livres`} />
          <MetricCard icon={Database} label="Gravações" value={metrics.recordings} detail={`${formatBytes(system?.recordings.totalBytes)} indexados`} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="h-fit rounded-3xl border border-border/70 bg-card/80 p-2 shadow-sm backdrop-blur">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                  activeSection === section.id ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${activeSection === section.id ? 'border-white/20 bg-white/10' : 'border-border bg-background/60 group-hover:bg-background'}`}>
                  <section.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{section.label}</span>
                  <span className={`block text-xs ${activeSection === section.id ? 'text-background/70' : 'text-muted-foreground'}`}>{section.description}</span>
                </span>
              </button>
            ))}
          </aside>

          <main className="space-y-6">
            {activeSection === 'general' && (
              <>
                <SectionTitle eyebrow="Geral" title="Identidade e experiência" description="Defina como a instalação aparece para os operadores e mantenha a interface confortável para monitoramento prolongado." />
                <Card className="overflow-hidden">
                  <SettingRow label="Nome da instalação" description="Aparece no cabeçalho e relatórios do sistema.">
                    <TextInput value={facilityName} onChange={(event) => setFacilityName(event.target.value)} />
                  </SettingRow>
                  <SettingRow label="Identificador do site" description="Use um nome estável para logs, integrações e auditoria.">
                    <TextInput value={siteId} onChange={(event) => setSiteId(event.target.value)} className="font-mono" />
                  </SettingRow>
                  <SettingRow label="Fuso horário" description="Base de data/hora para eventos, playback e auditoria.">
                    <SelectInput value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                      {['UTC-8', 'UTC-5', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+5:30', 'UTC+8'].map((tz) => <option key={tz}>{tz}</option>)}
                    </SelectInput>
                  </SettingRow>
                  <SettingRow label="Tema da interface" description="Modo escuro é recomendado para sala de monitoramento.">
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background/60 p-1">
                      {[
                        { id: 'dark', label: 'Escuro', icon: Moon },
                        { id: 'light', label: 'Claro', icon: Sun },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setTheme(item.id as 'dark' | 'light')}
                          className={`flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${theme === item.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          <item.icon className="h-3.5 w-3.5" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                </Card>
              </>
            )}

            {activeSection === 'users' && (
              <>
                <div className="flex items-end justify-between gap-4">
                  <SectionTitle eyebrow="Acesso" title="Usuários" description="Uma visão objetiva de quem pode acessar o sistema e qual perfil está em uso." />
                  <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold hover:bg-accent">
                    <Plus className="h-4 w-4" /> Adicionar
                  </button>
                </div>
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          {['Nome', 'Perfil', 'Crachá', 'E-mail', 'Turno', 'Status', 'Ações'].map((header) => <th key={header} className="px-4 py-3 text-left font-semibold">{header}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/70">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-accent/50">
                            <td className="px-4 py-3 font-medium">{user.name}</td>
                            <td className="px-4 py-3"><Pill tone={user.role === 'admin' ? 'danger' : user.role === 'supervisor' ? 'warning' : 'neutral'}>{user.role}</Pill></td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.badge}</td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.email}</td>
                            <td className="px-4 py-3 capitalize text-muted-foreground">{user.shift}</td>
                            <td className="px-4 py-3"><Pill tone={user.active ? 'success' : 'neutral'}>{user.active ? 'Ativo' : 'Inativo'}</Pill></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><Key className="h-4 w-4" /></button>
                                <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {activeSection === 'profiles' && (
              <>
                <SectionTitle eyebrow="Permissões" title="Perfis operacionais" description="Capacidades agrupadas por perfil para deixar claro o alcance de cada tipo de usuário." />
                <div className="grid gap-4 xl:grid-cols-3">
                  {Object.entries(ROLE_CAPS).map(([role, caps]) => (
                    <Card key={role} className="p-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold capitalize">{role}</h3>
                        <Pill tone={role === 'admin' ? 'danger' : role === 'supervisor' ? 'warning' : 'neutral'}>{role}</Pill>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {caps.map((cap) => <Pill key={cap}>{cap}</Pill>)}
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {activeSection === 'storage' && (
              <>
                <SectionTitle eyebrow="Monitoramento" title="Retenção e saúde do disco" description="Controles essenciais para manter gravações sob controle sem esconder o status real do servidor." />
                <Card className="overflow-hidden">
                  <SettingRow label="Retenção padrão" description="Quantidade de dias para manter gravações por câmera.">
                    <div className="flex items-center gap-3">
                      <Slider value={retentionDays} onValueChange={setRetentionDays} min={7} max={365} />
                      <span className="w-20 text-right font-mono text-xs">{retentionDays[0]} dias</span>
                    </div>
                  </SettingRow>
                  <SettingRow label="Prioridade de retenção" description="Zonas críticas encontradas no cadastro atual.">
                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      {retentionZones.length ? retentionZones.map((zone) => <Pill key={zone}>{zone}</Pill>) : <Pill>Sem zona</Pill>}
                    </div>
                  </SettingRow>
                  <SettingRow label="Limpeza automática" description="Remove gravações antigas quando o volume se aproxima do limite.">
                    <Toggle checked={true} onChange={() => {}} />
                  </SettingRow>
                  <SettingRow label="Volume de gravações" description={system?.recordingsRoot ?? 'Diretório ainda não informado.'}>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{formatBytes(system?.disk.usedBytes)} usados</p>
                      <p>{formatBytes(system?.disk.freeBytes)} livres</p>
                    </div>
                  </SettingRow>
                </Card>
              </>
            )}

            {activeSection === 'alarms' && (
              <>
                <SectionTitle eyebrow="Alertas" title="Notificações operacionais" description="Mantenha alarmes audíveis e escalonamento previsível para eventos críticos." />
                <Card className="overflow-hidden">
                  <SettingRow label="Alertas sonoros" description="Tocar áudio em alarmes ativos de prioridade alta.">
                    <Toggle checked={alarmAudio} onChange={setAlarmAudio} />
                  </SettingRow>
                  <SettingRow label="Manter eventos de movimento" description="Preservar clipes de movimento além da rotina contínua.">
                    <Toggle checked={motionRetain} onChange={setMotionRetain} />
                  </SettingRow>
                  <SettingRow label="Auto reconhecimento" description="Reconhecer alarmes de baixa prioridade após o tempo definido.">
                    <div className="flex items-center gap-3">
                      <Slider defaultValue={[60]} min={5} max={480} />
                      <span className="w-16 text-right font-mono text-xs">60 min</span>
                    </div>
                  </SettingRow>
                  <SettingRow label="Escalonamento P1" description="Escalonar alarmes críticos não reconhecidos em até 5 minutos.">
                    <Toggle checked={true} onChange={() => {}} />
                  </SettingRow>
                </Card>
              </>
            )}

            {activeSection === 'security' && (
              <>
                <SectionTitle eyebrow="Segurança" title="Sessão e auditoria" description="Regras simples para reduzir risco operacional sem travar o uso diário." />
                <Card className="overflow-hidden">
                  <SettingRow label="Tempo de sessão" description="Encerrar sessão após inatividade.">
                    <div className="flex items-center gap-3">
                      <Slider value={sessionTimeout} onValueChange={setSessionTimeout} min={5} max={480} />
                      <span className="w-16 text-right font-mono text-xs">{sessionTimeout[0]} min</span>
                    </div>
                  </SettingRow>
                  <SettingRow label="Máx. tentativas de login" description="Bloquear login após tentativas inválidas consecutivas.">
                    <div className="flex items-center gap-3">
                      <Slider value={maxLoginAttempts} onValueChange={setMaxLoginAttempts} min={3} max={10} />
                      <span className="w-10 text-right font-mono text-xs">{maxLoginAttempts[0]}</span>
                    </div>
                  </SettingRow>
                  <SettingRow label="Exigir senha forte" description="Senha com no mínimo 12 caracteres e complexidade.">
                    <Toggle checked={true} onChange={() => {}} />
                  </SettingRow>
                  <SettingRow label="Auditoria imutável" description="Registrar ações administrativas em trilha de auditoria protegida.">
                    <Toggle checked={true} onChange={() => {}} />
                  </SettingRow>
                </Card>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
