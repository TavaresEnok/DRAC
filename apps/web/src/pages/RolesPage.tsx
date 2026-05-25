import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Shield, Check, X, Edit2, LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { toast } from '../hooks/use-toast';

const API_URL = getApiBaseUrl();

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  liveView: { label: 'Ao Vivo', desc: 'Acessar transmissões ao vivo das câmeras' },
  playback: { label: 'Reprodução', desc: 'Revisar gravações' },
  alarmAck: { label: 'Reconhecer alarmes', desc: 'Reconhecer e gerenciar alarmes' },
  cameraConfig: { label: 'Configuração de câmeras', desc: 'Criar, editar e remover câmeras' },
  userManage: { label: 'Gestão de usuários', desc: 'Criar e editar contas de usuário' },
  auditLogs: { label: 'Logs de auditoria', desc: 'Acessar trilha de auditoria do sistema' },
  exportEvidence: { label: 'Exportar evidências', desc: 'Exportar clipes e pacotes de evidência' },
  serverConfig: { label: 'Configuração do servidor', desc: 'Gerenciar configurações do servidor' },
  roleManage: { label: 'Gestão de perfis', desc: 'Gerenciar perfis e permissões' },
  reportGenerate: { label: 'Relatórios', desc: 'Gerar e exportar relatórios' },
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  VIEWER: 'Visualizador',
};

const roleColor = (role: string) => {
  if (role === 'SUPER_ADMIN') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  if (role === 'ADMIN') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (role === 'OPERATOR') return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
};

type Matrix = Record<string, Record<string, boolean>>;

export default function PerfisPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [keys, setKeys] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [loading, setLoading] = useState(true);
  const [editRole, setEditRole] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${accessToken}` }), [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { data } = await axios.get<{ keys: string[]; roles: Matrix }>(`${API_URL}/role-permissions`, { headers: authHeaders });
      setKeys(data.keys ?? []);
      setMatrix(data.roles ?? {});
    } catch (error) {
      toast({
        title: 'Falha ao carregar perfis',
        description: error instanceof Error ? error.message : 'Não foi possível carregar as permissões.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = useMemo(() => Object.keys(matrix), [matrix]);

  const openEdit = (role: string) => {
    setEditRole(role);
    setEditPerms({ ...(matrix[role] ?? {}) });
  };

  const saveEdit = async () => {
    if (!editRole) return;
    setSaving(true);
    try {
      const { data } = await axios.patch<{ role: string; permissions: Record<string, boolean> }>(
        `${API_URL}/role-permissions/${editRole}`,
        { permissions: editPerms },
        { headers: authHeaders },
      );
      setMatrix((prev) => ({ ...prev, [data.role]: data.permissions }));
      setEditRole(null);
      toast({ title: 'Permissões salvas', description: `Perfil ${ROLE_LABELS[data.role] ?? data.role} atualizado.` });
    } catch (error) {
      toast({
        title: 'Falha ao salvar permissões',
        description: error instanceof Error ? error.message : 'Não foi possível salvar.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Perfis e Permissões</h1>
        </div>
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <p className="mb-4 text-xs text-muted-foreground">
          As permissões abaixo são aplicadas de verdade no servidor (ex.: configuração de câmeras e logs de auditoria).
          O Super Admin nunca é bloqueado.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-52">Permissão</th>
                {roles.map((role) => (
                  <th key={role} className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="outline" className={cn('text-[10px]', roleColor(role))}>{ROLE_LABELS[role] ?? role}</Badge>
                      <button
                        onClick={() => openEdit(role)}
                        disabled={role === 'SUPER_ADMIN'}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
                        title={role === 'SUPER_ADMIN' ? 'Super Admin tem acesso total e não pode ser limitado' : 'Editar permissões'}
                      >
                        <Edit2 className="h-2.5 w-2.5" />Editar
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((key, i) => (
                <tr key={key} className={cn('border-b border-border', i % 2 === 0 ? 'bg-transparent' : 'bg-card/30')}>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{PERMISSION_LABELS[key]?.label ?? key}</p>
                    <p className="text-[10px] text-muted-foreground">{PERMISSION_LABELS[key]?.desc ?? ''}</p>
                  </td>
                  {roles.map((role) => {
                    const allowed = matrix[role]?.[key];
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <div className={cn('h-5 w-5 rounded-full border flex items-center justify-center', allowed ? 'bg-green-500/15 border-green-500/30' : 'bg-slate-500/10 border-border')}>
                            {allowed ? <Check className="h-3 w-3 text-green-400" /> : <X className="h-3 w-3 text-muted-foreground/40" />}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!editRole} onOpenChange={(o) => !o && setEditRole(null)}>
        <SheetContent className="bg-card border-border w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Editar Perfil: {editRole ? (ROLE_LABELS[editRole] ?? editRole) : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {keys.map((key) => (
              <label key={key} className="flex items-center justify-between p-2 rounded hover:bg-accent/40 cursor-pointer">
                <div>
                  <p className="text-xs font-medium">{PERMISSION_LABELS[key]?.label ?? key}</p>
                  <p className="text-[10px] text-muted-foreground">{PERMISSION_LABELS[key]?.desc ?? ''}</p>
                </div>
                <input
                  type="checkbox"
                  checked={!!editPerms[key]}
                  onChange={(e) => setEditPerms((prev) => ({ ...prev, [key]: e.target.checked }))}
                  className="rounded"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setEditRole(null)} className="h-8 px-4 rounded border border-border text-xs hover:bg-accent">Cancelar</button>
              <button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {saving ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
