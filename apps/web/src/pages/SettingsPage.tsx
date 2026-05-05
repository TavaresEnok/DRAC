import {
  Shield, Server, Bell, Users,
  Lock, Save, RefreshCw, Trash2, Plus, Sun, Moon,
  Key, AlertTriangle, ChevronRight, Check, Database, FileLock
} from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { Slider } from '@/components/ui/slider';
import { useEffect, useState } from 'react';
import { useVmsDataStore } from '../store/vmsDataStore';

const SECTIONS = [
  { id: 'general', label: 'Geral', icon: Shield },
  { id: 'users', label: 'Usuários & Acesso', icon: Users },
  { id: 'profiles', label: 'Perfis e Permissões', icon: FileLock },
  { id: 'alarms', label: 'Alertas & Notificações', icon: Bell },
  { id: 'security', label: 'Segurança', icon: Lock },
];

function SectionLabel({ label }: { label: string }) {
  return <div className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">{label}</div>;
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Alternar({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

export default function ConfiguraçõesPage() {
  const { theme, setTheme } = useThemeStore();
  const users = useVmsDataStore((state) => state.users);
  const system = useVmsDataStore((state) => state.system);
  const cameras = useVmsDataStore((state) => state.cameras);
  const [activeSection, setActiveSection] = useState('general');

  // Geral settings state
  const [facilityNome, setFacilityNome] = useState('Servidor NexusGuard');
  const [siteId, setSiteId] = useState('LOCAL-SITE');
  const [timezone, setTimezone] = useState('UTC+0');
  const [motionRetain, setMotionRetain] = useState(true);
  const [alarmAudio, setAlarmAudio] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState([30]);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState([5]);
  const [retentionDays, setRetentionDays] = useState([90]);
  const [saved, setSaved] = useState(false);
  const roleCaps = {
    admin: ['Ao Vivo', 'Modo Mural', 'Reprodução', 'Eventos', 'Alertas', 'Câmeras', 'Mapa', 'PTZ', 'Investigação', 'Evidências', 'Configurações'],
    user: ['Ao Vivo', 'Reprodução', 'Eventos'],
  };
  const retentionPriorityZonas = Array.from(new Set(cameras.map((camera) => camera.zone).filter(Boolean))).slice(0, 3);

  const handleSalvar = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    if (system) {
      setFacilityNome(system.server.hostname);
      setSiteId(system.recordingsRoot);
    }
  }, [system]);

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar nav */}
      <div className="w-52 border-r border-border bg-card shrink-0 py-2">
        {SECTIONS.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative
              ${activeSection === section.id ? 'bg-[hsl(var(--accent))] text-foreground' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground'}`}
          >
            {activeSection === section.id && (
              <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-[hsl(var(--primary))] rounded-r" />
            )}
            <section.icon className="w-4 h-4 shrink-0" />
            {section.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl p-6 space-y-8">

          {activeSection === 'general' && (
            <>
              <div>
                <SectionLabel label="Nome da instalação" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Nome da instalação Nome" description="Exibido em todo o sistema">
                    <input value={facilityNome} onChange={e => setFacilityNome(e.target.value)}
                      className="h-8 px-3 w-64 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" />
                  </Field>
                  <Field label="Identificador do site" description="ID único desta instalação">
                    <input value={siteId} onChange={e => setSiteId(e.target.value)}
                      className="h-8 px-3 w-64 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]" />
                  </Field>
                  <Field label="Timezone">
                    <select value={timezone} onChange={e => setTimezone(e.target.value)}
                      className="h-8 px-3 w-40 rounded border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                    >
                      {['UTC-8', 'UTC-5', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+5:30', 'UTC+8'].map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div>
                <SectionLabel label="Appearance" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Tema da interface" description="O modo escuro é recomendado para centrais de monitoramento">
                    <div className="flex items-center gap-1 p-0.5 rounded bg-[hsl(var(--muted))] border border-border">
                      {[
                        { id: 'dark', icon: Moon, label: 'Escuro' },
                        { id: 'light', icon: Sun, label: 'Claro' },
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => setTheme(t.id as 'dark' | 'light')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors ${theme === t.id ? 'bg-card text-foreground shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}
                        >
                          <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </div>

              <div>
                <SectionLabel label="Gravação" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Manter eventos de movimento" description="Keep additional motion clips beyond schedule">
                    <Alternar checked={motionRetain} onChange={setMotionRetain} />
                  </Field>
                  <Field label="Alertas sonoros" description="Reproduzir som em alertas P1/P2">
                    <Alternar checked={alarmAudio} onChange={setAlarmAudio} />
                  </Field>
                </div>
              </div>
            </>
          )}

          {activeSection === 'users' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel label="Contas de usuários" />
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold hover:opacity-90 transition-opacity">
                  <Plus className="w-3.5 h-3.5" /> Add User
                </button>
              </div>
              <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Nome', 'Role', 'Badge', 'Email', 'Shift', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium text-[hsl(var(--muted-foreground))]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-[hsl(var(--accent))] transition-colors">
                        <td className="px-4 py-2.5 font-medium">{user.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border capitalize ${
                            user.role === 'admin' ? 'bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)_/_0.3)]' :
                            user.role === 'supervisor' ? 'bg-[hsl(var(--chart-2)_/_0.1)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)_/_0.3)]' :
                            'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border'
                          }`}>{user.role}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{user.badge}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{user.email}</td>
                        <td className="px-4 py-2.5 capitalize text-[hsl(var(--muted-foreground))]">{user.shift}</td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'status-online' : 'status-offline'}`} />
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{user.active ? 'Active' : 'Inativo'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"><Key className="w-3.5 h-3.5" /></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'profiles' && (
            <div className="space-y-6">
              <div>
                <SectionLabel label="Perfis padrão" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { role: 'admin', note: 'Controle total do sistema, armazenamento, usuários e exportações.' },
                    { role: 'user', note: 'Acesso operacional com escopo limitado de configuração.' },
                  ].map(item => (
                    <div key={item.role} className="bg-card border border-card-border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold capitalize">{item.role}</div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-border">{item.role}</span>
                      </div>
                      <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">{item.note}</div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {roleCaps[item.role as keyof typeof roleCaps].map(p => (
                          <span key={p} className="text-[9px] px-2 py-1 rounded-full border border-border bg-background">{p}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel label="Matriz de permissões" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  {[
                    ['Ao Vivo', true, true],
                    ['Modo Mural', true, false],
                    ['Reprodução', true, true],
                    ['Configurações', true, false],
                    ['Gestão de usuários', true, false],
                    ['Retenção de armazenamento', true, false],
                  ].map(([label, admin, user]) => (
                    <Field key={String(label)} label={String(label)}>
                      <div className="flex items-center gap-4 text-[10px]">
                        <span className="text-[hsl(var(--primary))]">{admin ? 'Admin' : '—'}</span>
                        <span className="text-[hsl(var(--muted-foreground))]">{user ? 'User' : '—'}</span>
                      </div>
                    </Field>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'storage' && (
            <>
              <div>
                <SectionLabel label="Retenção de armazenamento" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Retenção padrão" description="Dias para manter gravações por câmera">
                    <div className="flex items-center gap-3 w-48">
                      <Slider value={retentionDays} onValueChange={setRetentionDays} min={7} max={365} />
                      <span className="font-mono text-xs w-14">{retentionDays[0]} dias</span>
                    </div>
                  </Field>
                  <Field label="Prioridade de retenção" description="Priorizar câmeras críticas para retenção maior">
                    <div className="flex items-center gap-2 text-[10px]">
                      {retentionPriorityZonas.length ? retentionPriorityZonas.map((zone) => (
                        <span key={zone} className="px-2 py-1 rounded-full border border-border bg-background">{zone}</span>
                      )) : (
                        <span className="px-2 py-1 rounded-full border border-border bg-background">Sem zona configurada</span>
                      )}
                    </div>
                  </Field>
                  <Field label="Auto-purge on Full" description="Automatically delete oldest recordings when storage is full">
                    <Alternar checked={true} onChange={() => {}} />
                  </Field>
                </div>
              </div>
              <div>
                <SectionLabel label="Saúde do armazenamento" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Alert Threshold" description="Warn when storage drops below this percentage">
                    <div className="flex items-center gap-3 w-48">
                      <Slider value={[15]} min={5} max={30} />
                      <span className="font-mono text-xs w-14">15%</span>
                    </div>
                  </Field>
                  <Field label="Archive Armazenamento" description="Move old footage to offline archive volume">
                    <Alternar checked={true} onChange={() => {}} />
                  </Field>
                </div>
              </div>
            </>
          )}

          {activeSection === 'alarms' && (
            <div>
              <SectionLabel label="Alarm Configuration" />
              <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                <Field label="Audio Alerts" description="Play audio cue on active alarms"><Alternar checked={alarmAudio} onChange={setAlarmAudio} /></Field>
                <Field label="Auto-acknowledge Timeout" description="Auto-acknowledge low priority alarms after N minutes">
                  <div className="flex items-center gap-3 w-40">
                    <Slider defaultValue={[60]} min={5} max={480} />
                    <span className="font-mono text-xs w-14">60 min</span>
                  </div>
                </Field>
                <Field label="P1 Escalation" description="Escalate P1 alarms if not acknowledged after 5 minutes"><Alternar checked={true} onChange={() => {}} /></Field>
                <Field label="Notificações por E-mail" description="Enviar e-mail em alertas P1/P2"><Alternar checked={false} onChange={() => {}} /></Field>
                <Field label="Notificações por SMS" description="Enviar SMS ao plantonista em alertas P1"><Alternar checked={false} onChange={() => {}} /></Field>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <div>
                <SectionLabel label="Authentication" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Session Timeout" description="Auto-logout after N minutes of inactivity">
                    <div className="flex items-center gap-3 w-48">
                      <Slider value={sessionTimeout} onValueChange={setSessionTimeout} min={5} max={480} />
                      <span className="font-mono text-xs w-20">{sessionTimeout[0]} min</span>
                    </div>
                  </Field>
                  <Field label="Max Login Attempts" description="Lock account after N failed attempts">
                    <div className="flex items-center gap-3 w-48">
                      <Slider value={maxLoginAttempts} onValueChange={setMaxLoginAttempts} min={3} max={10} />
                      <span className="font-mono text-xs w-8">{maxLoginAttempts[0]}</span>
                    </div>
                  </Field>
                  <Field label="Require Strong Password" description="Enforce minimum 12-char complex passwords"><Alternar checked={true} onChange={() => {}} /></Field>
                  <Field label="Force Password Rotation" description="Require password change every 90 dias"><Alternar checked={true} onChange={() => {}} /></Field>
                </div>
              </div>
              <div>
                <SectionLabel label="Audit" />
                <div className="bg-card border border-card-border rounded-lg px-4 divide-y divide-border">
                  <Field label="Enable Audit Log" description="Log all user actions with timestamps"><Alternar checked={true} onChange={() => {}} /></Field>
                  <Field label="Modo de auditoria imutável" description="Gravar auditoria em armazenamento somente escrita"><Alternar checked={true} onChange={() => {}} /></Field>
                  <Field label="Retenção de auditoria" description="Days to retain audit logs">
                    <div className="flex items-center gap-3 w-48">
                      <Slider defaultValue={[365]} min={90} max={730} />
                      <span className="font-mono text-xs w-20">365 dias</span>
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* Salvar button */}
          <div className="flex items-center justify-end pt-2">
            <button
              onClick={handleSalvar}
              className={`flex items-center gap-2 px-4 py-2.5 rounded text-sm font-semibold transition-all ${saved ? 'bg-[hsl(var(--chart-3))] text-white' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'}`}
              data-testid="button-save-settings"
            >
              {saved ? <><Check className="w-4 h-4" /> Salvo</> : <><Save className="w-4 h-4" /> Salvar alterações</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
