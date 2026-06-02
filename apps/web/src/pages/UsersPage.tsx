import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Users, Plus, UserX, Unlock, Edit2, FolderLock, Camera, Save, Trash2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useVmsDataStore } from '../store/vmsDataStore';
import { useAuthStore } from '../store/authStore';
import { getApiBaseUrl } from '../lib/api-base';
import { toast } from '../hooks/use-toast';

const API_URL = getApiBaseUrl();

type PermissionLevel = 'VIEW' | 'CONTROL' | 'RECORD' | 'ADMIN';
type ApiUserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

type AccessGroup = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  cameras: Array<{ id: string; name: string }>;
};

type AccessPermission = {
  id: string;
  userId: string;
  cameraId?: string | null;
  groupId?: string | null;
  level: PermissionLevel;
  user?: { id: string; name: string; email: string };
  group?: { id: string; name: string } | null;
  camera?: { id: string; name: string } | null;
};

const roleColor = (r: string) => {
  if (r === 'admin') return 'bg-[hsl(var(--primary)_/_0.12)] text-[hsl(var(--primary))] border-[hsl(var(--primary)_/_0.25)]';
  if (r === 'supervisor') return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  if (r === 'operator') return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
  return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
};

const levelLabel: Record<PermissionLevel, string> = {
  VIEW: 'Ver ao vivo e playback',
  CONTROL: 'Ver e controlar PTZ',
  RECORD: 'Ver, controlar e gravação',
  ADMIN: 'Administrar câmeras do grupo',
};

const roleOptions: Array<{ value: ApiUserRole; label: string }> = [
  { value: 'VIEWER', label: 'Visualizador' },
  { value: 'OPERATOR', label: 'Operador' },
  { value: 'ADMIN', label: 'Administrador' },
];

function apiClient() {
  const accessToken = useAuthStore.getState().accessToken;
  return axios.create({
    baseURL: API_URL,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

export default function UsuariosPage() {
  const userList = useVmsDataStore((state) => state.users);
  const cameras = useVmsDataStore((state) => state.cameras);
  const updateUserActive = useVmsDataStore((state) => state.updateUserActive);
  const loadData = useVmsDataStore((state) => state.load);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<(typeof userList)[number] | null>(null);
  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [permissions, setPermissions] = useState<AccessPermission[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<PermissionLevel>('VIEW');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [userSaving, setUserSaving] = useState(false);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'VIEWER' as ApiUserRole,
    isActive: true,
  });

  const filtered = userList.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const selectedUser = userList.find((user) => user.id === selectedUserId) ?? userList[0] ?? null;

  const permissionsByUser = useMemo(() => {
    const map = new Map<string, AccessPermission[]>();
    for (const permission of permissions) {
      const list = map.get(permission.userId) ?? [];
      list.push(permission);
      map.set(permission.userId, list);
    }
    return map;
  }, [permissions]);

  const groupCameraIds = useMemo(() => new Set(selectedGroup?.cameras.map((camera) => camera.id) ?? []), [selectedGroup]);

  const loadAccess = async () => {
    if (!accessToken) return;
    setAccessLoading(true);
    try {
      const client = apiClient();
      const [groupsRes, permissionsRes] = await Promise.all([
        client.get('/camera-groups'),
        client.get('/camera-permissions'),
      ]);
      const loadedGroups = Array.isArray(groupsRes.data) ? groupsRes.data : [];
      setGroups(loadedGroups);
      setPermissions(Array.isArray(permissionsRes.data) ? permissionsRes.data : []);
      if (!selectedGroupId && loadedGroups[0]?.id) setSelectedGroupId(loadedGroups[0].id);
      if (!selectedUserId && userList[0]?.id) setSelectedUserId(userList[0].id);
    } catch (error) {
      toast({
        title: 'Falha ao carregar acessos',
        description: error instanceof Error ? error.message : 'Não foi possível carregar grupos e permissões.',
        variant: 'destructive',
      });
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    void loadAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userList.length]);

  useEffect(() => {
    if (!selectedUserId && userList[0]?.id) setSelectedUserId(userList[0].id);
  }, [selectedUserId, userList]);

  useEffect(() => {
    if (editUser) {
      setUserForm({
        name: editUser.name,
        email: editUser.email,
        password: '',
        role: editUser.role === 'admin' ? 'ADMIN' : editUser.role === 'operator' ? 'OPERATOR' : 'VIEWER',
        isActive: editUser.active,
      });
      return;
    }
    if (addOpen) {
      setUserForm({ name: '', email: '', password: '', role: 'VIEWER', isActive: true });
    }
  }, [addOpen, editUser]);

  const toggleLock = async (id: string, active: boolean) => {
    await updateUserActive(id, active);
  };

  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setAccessLoading(true);
    try {
      const { data } = await apiClient().post('/camera-groups', {
        name,
        description: newGroupDescription.trim() || undefined,
      });
      setNewGroupName('');
      setNewGroupDescription('');
      setSelectedGroupId(data.id);
      await loadAccess();
      toast({ title: 'Grupo criado', description: `${name} pronto para receber câmeras e usuários.` });
    } catch (error) {
      toast({
        title: 'Falha ao criar grupo',
        description: error instanceof Error ? error.message : 'Não foi possível criar o grupo.',
        variant: 'destructive',
      });
    } finally {
      setAccessLoading(false);
    }
  };

  const setCameraInGroup = async (cameraId: string, shouldAdd: boolean) => {
    if (!selectedGroup) return;
    setAccessLoading(true);
    try {
      if (shouldAdd) {
        await apiClient().post(`/camera-groups/${selectedGroup.id}/cameras/${cameraId}`);
      } else {
        await apiClient().delete(`/camera-groups/${selectedGroup.id}/cameras/${cameraId}`);
      }
      await Promise.all([loadAccess(), loadData()]);
    } catch (error) {
      toast({
        title: shouldAdd ? 'Falha ao adicionar câmera' : 'Falha ao remover câmera',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o grupo.',
        variant: 'destructive',
      });
    } finally {
      setAccessLoading(false);
    }
  };

  const grantGroupAccess = async () => {
    const userId = selectedUser?.id;
    const groupId = selectedGroup?.id;
    if (!userId || !groupId) return;
    setAccessLoading(true);
    try {
      await apiClient().post('/camera-permissions', { userId, groupId, level: selectedLevel });
      await loadAccess();
      toast({ title: 'Acesso liberado', description: `${selectedUser?.name} agora acessa ${selectedGroup?.name}.` });
    } catch (error) {
      toast({
        title: 'Falha ao liberar acesso',
        description: error instanceof Error ? error.message : 'Não foi possível salvar a permissão.',
        variant: 'destructive',
      });
    } finally {
      setAccessLoading(false);
    }
  };

  const revokeAccess = async (permissionId: string) => {
    setAccessLoading(true);
    try {
      await apiClient().delete(`/camera-permissions/${permissionId}`);
      await loadAccess();
    } catch (error) {
      toast({
        title: 'Falha ao remover acesso',
        description: error instanceof Error ? error.message : 'Não foi possível remover a permissão.',
        variant: 'destructive',
      });
    } finally {
      setAccessLoading(false);
    }
  };

  const saveUser = async () => {
    const name = userForm.name.trim();
    const email = userForm.email.trim().toLowerCase();
    if (!name || !email) {
      toast({ title: 'Dados incompletos', description: 'Informe nome e e-mail.', variant: 'destructive' });
      return;
    }
    if (!editUser && !userForm.password) {
      toast({ title: 'Senha obrigatória', description: 'Crie uma senha inicial para o usuário.', variant: 'destructive' });
      return;
    }

    setUserSaving(true);
    try {
      if (editUser) {
        await apiClient().patch(`/users/${editUser.id}`, {
          name,
          email,
          role: userForm.role,
          isActive: userForm.isActive,
          ...(userForm.password ? { password: userForm.password } : {}),
        });
        toast({ title: 'Usuário atualizado', description: `${name} foi atualizado.` });
      } else {
        await apiClient().post('/users', {
          name,
          email,
          password: userForm.password,
          role: userForm.role,
        });
        toast({ title: 'Usuário criado', description: `${name} já pode receber acesso a grupos.` });
      }
      setAddOpen(false);
      setEditUser(null);
      setUserForm({ name: '', email: '', password: '', role: 'VIEWER', isActive: true });
      await Promise.all([loadData(), loadAccess()]);
    } catch (error) {
      toast({
        title: editUser ? 'Falha ao atualizar usuário' : 'Falha ao criar usuário',
        description: error instanceof Error ? error.message : 'Não foi possível salvar o usuário.',
        variant: 'destructive',
      });
    } finally {
      setUserSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Usuários e acessos</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar usuários..."
            className="h-7 w-44 rounded border border-border bg-card px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={() => void loadAccess()}
            disabled={accessLoading}
            className="flex h-7 items-center gap-1.5 rounded border border-border bg-card px-3 text-xs hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', accessLoading && 'animate-spin')} />
            Atualizar
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded bg-primary px-3 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo usuário
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-card/45">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Usuários do sistema</p>
            <p className="text-xs text-muted-foreground">Perfis definem ações. Grupos definem quais câmeras cada pessoa vê.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-card/80">
                <tr>
                  {['Nome', 'Email', 'Perfil', 'Grupos', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const userPermissions = permissionsByUser.get(u.id) ?? [];
                  const groupPermissions = userPermissions.filter((permission) => permission.groupId);
                  return (
                    <tr
                      key={u.id}
                      className={cn('border-t border-border transition-colors',
                        i % 2 === 0 ? 'bg-transparent hover:bg-accent/35' : 'bg-background/30 hover:bg-accent/35',
                        !u.active && 'opacity-60'
                      )}
                    >
                      <td className="px-4 py-3">
                        <button className="flex items-center gap-2.5 text-left" onClick={() => setSelectedUserId(u.id)}>
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="font-medium">{u.name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('text-[10px]', roleColor(u.role))}>{u.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {groupPermissions.length ? (
                          <div className="flex max-w-[260px] flex-wrap gap-1.5">
                            {groupPermissions.map((permission) => (
                              <Badge key={permission.id} variant="outline" className="border-border bg-background/70 text-[10px] text-muted-foreground">
                                {permission.group?.name ?? 'Grupo'}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem grupo</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('text-[10px]',
                          u.active ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400' : 'border-red-500/30 bg-red-500/15 text-red-400'
                        )}>{u.active ? 'Ativo' : 'Bloqueado'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditUser(u)} className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card hover:bg-accent">
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => void toggleLock(u.id, !u.active)}
                            className={cn('flex h-6 w-6 items-center justify-center rounded border transition-colors',
                              !u.active ? 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-border bg-card hover:bg-accent'
                            )}
                          >
                            {!u.active ? <Unlock className="h-3 w-3 text-emerald-400" /> : <UserX className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card/45 p-4">
            <div className="mb-4 flex items-start gap-2">
              <FolderLock className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Grupos de acesso</p>
                <p className="text-xs text-muted-foreground">Use um grupo para cada cliente/local: mercado, academia, condominio ou filial.</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Ex: Mercado Sao Jose"
                className="h-9 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => void createGroup()}
                disabled={accessLoading || !newGroupName.trim()}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar
              </button>
            </div>
            <input
              value={newGroupDescription}
              onChange={(event) => setNewGroupDescription(event.target.value)}
              placeholder="Descrição opcional"
              className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={cn('rounded-lg border p-3 text-left transition-colors',
                    selectedGroup?.id === group.id
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border bg-background/65 text-muted-foreground hover:bg-accent/45 hover:text-foreground'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold">{group.name}</span>
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">{group.cameras.length} cam.</span>
                  </div>
                  {group.description ? <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{group.description}</p> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card/45 p-4">
            <div className="mb-4 flex items-start gap-2">
              <Camera className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Câmeras do grupo</p>
                <p className="text-xs text-muted-foreground">{selectedGroup ? `Selecionado: ${selectedGroup.name}` : 'Crie ou selecione um grupo para vincular câmeras.'}</p>
              </div>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {cameras.map((camera) => {
                const checked = groupCameraIds.has(camera.id);
                return (
                  <label key={camera.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background/55 px-3 py-2 text-xs hover:bg-accent/40">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{camera.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{camera.ipAddress} · {camera.resolution}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectedGroup || accessLoading}
                      onChange={(event) => void setCameraInGroup(camera.id, event.target.checked)}
                      className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card/45 p-4">
            <div className="mb-4 flex items-start gap-2">
              <Save className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Acesso por grupo</p>
                <p className="text-xs text-muted-foreground">O usuário vê apenas as câmeras dos grupos liberados.</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={selectedUser?.id ?? ''}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {userList.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <select
                value={selectedGroup?.id ?? ''}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select
                value={selectedLevel}
                onChange={(event) => setSelectedLevel(event.target.value as PermissionLevel)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {(Object.keys(levelLabel) as PermissionLevel[]).map((level) => <option key={level} value={level}>{levelLabel[level]}</option>)}
              </select>
            </div>
            <button
              onClick={() => void grantGroupAccess()}
              disabled={accessLoading || !selectedUser || !selectedGroup}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Salvar acesso ao grupo
            </button>

            <div className="mt-4 space-y-2">
              {(selectedUser ? permissionsByUser.get(selectedUser.id) ?? [] : []).filter((permission) => permission.groupId).map((permission) => (
                <div key={permission.id} className="flex items-center justify-between rounded-lg border border-border bg-background/55 px-3 py-2 text-xs">
                  <div>
                    <p className="font-medium">{permission.group?.name ?? 'Grupo removido'}</p>
                    <p className="text-[11px] text-muted-foreground">{levelLabel[permission.level]}</p>
                  </div>
                  <button
                    onClick={() => void revokeAccess(permission.id)}
                    disabled={accessLoading}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    title="Remover acesso"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={addOpen || !!editUser} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditUser(null); } }}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editUser ? `Editar usuário - ${editUser.name}` : 'Novo usuário'}</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome completo</label>
              <input
                value={userForm.name}
                onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome do usuário"
                className="h-8 w-full rounded border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                value={userForm.email}
                onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="cliente@empresa.com"
                className="h-8 w-full rounded border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Perfil</label>
              <select
                value={userForm.role}
                onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as ApiUserRole }))}
                className="h-8 w-full rounded border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{editUser ? 'Nova senha' : 'Senha inicial'}</label>
              <input
                type="password"
                value={userForm.password}
                onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editUser ? 'Deixe em branco para manter' : 'Mínimo 10, maiúscula, número e símbolo'}
                className="h-8 w-full rounded border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {editUser ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={userForm.isActive}
                  onChange={(event) => setUserForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="rounded"
                />
                <span className="text-xs text-muted-foreground">Usuário ativo</span>
              </label>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setAddOpen(false); setEditUser(null); }} className="h-8 rounded border border-border px-4 text-xs hover:bg-accent">Cancelar</button>
              <button
                onClick={() => void saveUser()}
                disabled={userSaving}
                className="h-8 rounded bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {editUser ? 'Salvar alterações' : 'Criar usuário'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
