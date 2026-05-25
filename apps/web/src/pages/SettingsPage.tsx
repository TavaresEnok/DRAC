import type { InputHTMLAttributes, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Check,
  Database,
  HardDrive,
  LoaderCircle,
  Lock,
  Moon,
  Save,
  Server,
  Shield,
  Sun,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useThemeStore } from '../store/themeStore';
import { useVmsDataStore } from '../store/vmsDataStore';
import { useAuthStore } from '../store/authStore';
import { getApiBaseUrl } from '../lib/api-base';
import { toast } from '../hooks/use-toast';

const API_URL = getApiBaseUrl();

const SECTIONS = [
  { id: 'general', label: 'Geral', description: 'Identidade e tema', icon: Shield },
  { id: 'users', label: 'Usuários', description: 'Contas e acesso', icon: Users },
  { id: 'storage', label: 'Retenção', description: 'Retenção e disco', icon: Database },
  { id: 'security', label: 'Segurança', description: 'Sessão e senha', icon: Lock },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

type SystemSettings = {
  facilityName: string;
  defaultRetentionDays: number;
  autoCleanupEnabled: boolean;
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  requireStrongPassword: boolean;
  alarmAudioEnabled: boolean;
};

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

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'danger' | 'success' | 'warning' }) {
  const toneClass = {
    neutral: 'border-border bg-background text-muted-foreground',
    danger: 'border-red-500/25 bg-red-500/10 text-red-300',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}>{children}</span>;
}

export default function ConfiguracoesPage() {
  const { theme, setTheme } = useThemeStore();
  const users = useVmsDataStore((state) => state.users);
  const system = useVmsDataStore((state) => state.system);
  const cameras = useVmsDataStore((state) => state.cameras);
  const accessToken = useAuthStore((state) => state.accessToken);

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${accessToken}` }), [accessToken]);

  const loadSettings = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { data } = await axios.get<SystemSettings>(`${API_URL}/settings`, { headers: authHeaders });
      setSettings(data);
    } catch (error) {
      toast({
        title: 'Falha ao carregar configurações',
        description: error instanceof Error ? error.message : 'Não foi possível carregar.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, authHeaders]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const update = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  };

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

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { data } = await axios.patch<SystemSettings>(`${API_URL}/settings`, settings, { headers: authHeaders });
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      toast({ title: 'Configurações salvas', description: 'As alterações foram aplicadas no servidor.' });
    } catch (error) {
      toast({
        title: 'Falha ao salvar',
        description: error instanceof Error ? error.message : 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,hsl(var(--accent))_0,transparent_32rem)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Sistema</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
            <p className="mt-1 text-sm text-muted-foreground">Cada ajuste abaixo é persistido e aplicado de fato no servidor.</p>
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading || !settings}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60 ${
              saved ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : 'bg-foreground text-background hover:bg-foreground/90'
            }`}
            data-testid="button-save-settings"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
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
            {loading || !settings ? (
              <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Carregando configurações...
              </Card>
            ) : (
              <>
                {activeSection === 'general' && (
                  <>
                    <SectionTitle eyebrow="Geral" title="Identidade e experiência" description="Nome da instalação (persistido) e tema da interface (preferência local do navegador)." />
                    <Card className="overflow-hidden">
                      <SettingRow label="Nome da instalação" description="Identifica este servidor. Persistido no banco de dados.">
                        <TextInput value={settings.facilityName} onChange={(event) => update('facilityName', event.target.value)} />
                      </SettingRow>
                      <SettingRow label="Tema da interface" description="Preferência visual deste navegador.">
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
                    <SectionTitle eyebrow="Acesso" title="Usuários" description="Visão somente leitura. Gestão completa na página de Usuários; perfis em Perfis e Permissões." />
                    <Card className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              {['Nome', 'Perfil', 'E-mail', 'Status'].map((header) => <th key={header} className="px-4 py-3 text-left font-semibold">{header}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/70">
                            {users.map((user) => (
                              <tr key={user.id} className="hover:bg-accent/50">
                                <td className="px-4 py-3 font-medium">{user.name}</td>
                                <td className="px-4 py-3"><Pill tone={user.role === 'admin' ? 'danger' : user.role === 'supervisor' ? 'warning' : 'neutral'}>{user.role}</Pill></td>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.email}</td>
                                <td className="px-4 py-3"><Pill tone={user.active ? 'success' : 'neutral'}>{user.active ? 'Ativo' : 'Inativo'}</Pill></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </>
                )}

                {activeSection === 'storage' && (
                  <>
                    <SectionTitle eyebrow="Retenção" title="Retenção e disco" description="A retenção padrão é aplicada pela rotina de limpeza; câmeras podem ter override individual." />
                    <Card className="overflow-hidden">
                      <SettingRow label="Retenção padrão" description="Dias para manter gravações sem override por câmera.">
                        <div className="flex items-center gap-3">
                          <Slider value={[settings.defaultRetentionDays]} onValueChange={(v) => update('defaultRetentionDays', v[0])} min={1} max={365} />
                          <span className="w-20 text-right font-mono text-xs">{settings.defaultRetentionDays} dias</span>
                        </div>
                      </SettingRow>
                      <SettingRow label="Limpeza automática" description="Quando o disco passa de 90%, remove as gravações mais antigas automaticamente.">
                        <Toggle checked={settings.autoCleanupEnabled} onChange={(v) => update('autoCleanupEnabled', v)} />
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

                {activeSection === 'security' && (
                  <>
                    <SectionTitle eyebrow="Segurança" title="Sessão e senha" description="Regras aplicadas no login e na criação/edição de usuários." />
                    <Card className="overflow-hidden">
                      <SettingRow label="Tempo de sessão" description="Validade do token de acesso (aplicada no próximo login).">
                        <div className="flex items-center gap-3">
                          <Slider value={[settings.sessionTimeoutMinutes]} onValueChange={(v) => update('sessionTimeoutMinutes', v[0])} min={5} max={1440} />
                          <span className="w-16 text-right font-mono text-xs">{settings.sessionTimeoutMinutes} min</span>
                        </div>
                      </SettingRow>
                      <SettingRow label="Máx. tentativas de login" description="Bloqueia a conta por 15 min após este número de falhas consecutivas.">
                        <div className="flex items-center gap-3">
                          <Slider value={[settings.maxLoginAttempts]} onValueChange={(v) => update('maxLoginAttempts', v[0])} min={3} max={20} />
                          <span className="w-10 text-right font-mono text-xs">{settings.maxLoginAttempts}</span>
                        </div>
                      </SettingRow>
                      <SettingRow label="Exigir senha forte" description="Exige no mínimo 12 caracteres com maiúscula, minúscula e número ao criar/editar usuários.">
                        <Toggle checked={settings.requireStrongPassword} onChange={(v) => update('requireStrongPassword', v)} />
                      </SettingRow>
                    </Card>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
