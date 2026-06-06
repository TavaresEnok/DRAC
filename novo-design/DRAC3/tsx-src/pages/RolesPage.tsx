import { useState, Fragment } from 'react';
import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '../store/authStore';

type RoleId = 'admin' | 'supervisor' | 'group_admin' | 'operator';

type RoleDef = {
  id: RoleId;
  name: string;
  description: string;
  userCount?: number;
  scope: 'global' | 'group';
};

type Permission = {
  id: string;
  label: string;
  category: string;
  locked?: boolean; // enforced by system — cannot be toggled
};

const ROLES: RoleDef[] = [
  { id: 'admin',       name: 'Admin do sistema', description: 'Acesso total: todos os grupos, configurações globais e logs.', scope: 'global' },
  { id: 'supervisor',  name: 'Supervisor',        description: 'Visualiza todos os grupos; sem alterar configurações críticas.', scope: 'global' },
  { id: 'group_admin', name: 'Admin de grupo',    description: 'Gerencia usuários, câmeras e alarmes do próprio grupo.', scope: 'group' },
  { id: 'operator',    name: 'Operador',          description: 'Live, playback e alarmes — apenas câmeras do grupo vinculado.', scope: 'group' },
];

const PERMISSIONS: Permission[] = [
  // Monitoramento
  { id: 'live',      label: 'Ao vivo',                         category: 'Monitoramento' },
  { id: 'playback',  label: 'Reprodução (playback)',           category: 'Monitoramento' },
  { id: 'ptz',       label: 'Controle PTZ',                    category: 'Monitoramento' },
  { id: 'ai_view',   label: 'Ver detecções de IA',             category: 'Monitoramento' },
  // Incidentes
  { id: 'alarms_view',   label: 'Ver alarmes do grupo',        category: 'Incidentes' },
  { id: 'alarms_ack',    label: 'Reconhecer alarmes',          category: 'Incidentes' },
  { id: 'alarms_resolve',label: 'Resolver alarmes',            category: 'Incidentes' },
  { id: 'evidence',      label: 'Exportar evidências',         category: 'Incidentes' },
  // Câmeras
  { id: 'cams_view',   label: 'Ver câmeras do grupo',          category: 'Câmeras' },
  { id: 'cams_edit',   label: 'Editar câmeras',                category: 'Câmeras' },
  { id: 'cams_add',    label: 'Adicionar / remover câmeras',   category: 'Câmeras' },
  // Usuários
  { id: 'users_group', label: 'Gerenciar usuários do grupo',   category: 'Usuários' },
  { id: 'users_global',label: 'Gerenciar todos os usuários',   category: 'Usuários' },
  // Sistema
  { id: 'settings',    label: 'Configurações globais',         category: 'Sistema' },
  { id: 'audit',       label: 'Logs de auditoria (global)',    category: 'Sistema' },
  { id: 'other_groups',label: 'Ver outros grupos',             category: 'Sistema', locked: true },
];

// Permission matrix: 1 = allowed, 0 = denied, 'lock' = system-enforced
type Perm = 1 | 0 | 'lock';
const MATRIX: Record<RoleId, Record<string, Perm>> = {
  admin:       { live:1, playback:1, ptz:1, ai_view:1, alarms_view:1, alarms_ack:1, alarms_resolve:1, evidence:1, cams_view:1, cams_edit:1, cams_add:1, users_group:1, users_global:1, settings:1, audit:1, other_groups:1 },
  supervisor:  { live:1, playback:1, ptz:0, ai_view:1, alarms_view:1, alarms_ack:1, alarms_resolve:0, evidence:1, cams_view:1, cams_edit:0, cams_add:0, users_group:0, users_global:0, settings:0, audit:1, other_groups:1 },
  group_admin: { live:1, playback:1, ptz:1, ai_view:1, alarms_view:1, alarms_ack:1, alarms_resolve:1, evidence:1, cams_view:1, cams_edit:1, cams_add:0, users_group:1, users_global:0, settings:0, audit:0, other_groups:'lock' },
  operator:    { live:1, playback:1, ptz:1, ai_view:1, alarms_view:1, alarms_ack:1, alarms_resolve:0, evidence:1, cams_view:1, cams_edit:0, cams_add:0, users_group:0, users_global:0, settings:0, audit:0, other_groups:'lock' },
};

export default function RolesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const [selected, setSelected] = useState<RoleId>('admin');

  const categories = [...new Set(PERMISSIONS.map((p) => p.category))];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Funções e Permissões</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Perfis do sistema · permissões são aplicadas automaticamente
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" className="text-xs" disabled title="Funções personalizadas em breve">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova função
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Role cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelected(role.id)}
              className={cn(
                'text-left p-4 rounded-xl border transition-colors',
                selected === role.id
                  ? 'border-[hsl(var(--primary)_/_0.45)] bg-[hsl(var(--primary)_/_0.06)]'
                  : 'border-border bg-card hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--accent)_/_0.5)]'
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={cn(
                  'text-[12.5px] font-semibold',
                  selected === role.id ? 'text-[hsl(var(--primary))]' : 'text-foreground'
                )}>
                  {role.name}
                </span>
                <Badge variant="outline" className={cn(
                  'text-[9px] shrink-0',
                  role.scope === 'global'
                    ? 'border-[hsl(var(--primary)_/_0.3)] text-[hsl(var(--primary))]'
                    : 'border-border text-muted-foreground'
                )}>
                  {role.scope === 'global' ? 'Global' : 'Grupo'}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{role.description}</p>
            </button>
          ))}
        </div>

        {/* Permission matrix */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[13px] font-semibold">Matriz de permissões</h2>
            <span className="text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted border border-border">
              Coluna destacada: {ROLES.find((r) => r.id === selected)?.name}
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-72">
                    Permissão
                  </th>
                  {ROLES.map((role) => (
                    <th
                      key={role.id}
                      onClick={() => setSelected(role.id)}
                      className={cn(
                        'px-4 py-3 text-center text-[11px] font-semibold cursor-pointer transition-colors w-32',
                        selected === role.id
                          ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_0.04)]'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {role.name.replace('do sistema', '').replace('de grupo', '').trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <Fragment key={cat}>
                    <tr className="bg-muted/30">
                      <td colSpan={5} className="px-5 py-2">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{cat}</span>
                      </td>
                    </tr>
                    {PERMISSIONS.filter((p) => p.category === cat).map((perm) => (
                      <tr key={perm.id} className="border-t border-border/60 hover:bg-[hsl(var(--accent)_/_0.4)] transition-colors">
                        <td className="px-5 py-3 text-[12px] text-foreground">
                          {perm.label}
                          {perm.locked && (
                            <span className="ml-2 text-[9px] font-mono text-muted-foreground/60">(sistema)</span>
                          )}
                        </td>
                        {ROLES.map((role) => {
                          const val = MATRIX[role.id][perm.id];
                          const isSel = selected === role.id;
                          return (
                            <td
                              key={role.id}
                              className={cn(
                                'px-4 py-3 text-center',
                                isSel && 'bg-[hsl(var(--primary)_/_0.04)]'
                              )}
                            >
                              {val === 'lock' ? (
                                <span className="inline-flex items-center justify-center text-[10px] text-muted-foreground/50 font-mono">
                                  bloq.
                                </span>
                              ) : val === 1 ? (
                                <span className={cn(
                                  'inline-flex items-center justify-center w-5 h-5 rounded-full',
                                  isSel
                                    ? 'bg-[hsl(var(--primary)_/_0.15)] text-[hsl(var(--primary))]'
                                    : 'text-[hsl(var(--muted-foreground))]'
                                )}>
                                  <Check className="w-3 h-3" />
                                </span>
                              ) : (
                                <span className="text-muted-foreground/30 text-[13px] font-light">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground">
            Permissões marcadas como <span className="font-mono">bloq.</span> são impostas pelo sistema para garantir o isolamento entre clientes e não podem ser alteradas.
            Funções de escopo <span className="font-semibold">Grupo</span> só enxergam câmeras e usuários do grupo ao qual foram vinculados.
          </p>
        </div>
      </div>
    </div>
  );
}
