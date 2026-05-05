import { useState } from 'react';
import { Shield, Check, X, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const DEFAULT_ROLES = [
  {
    id: 'role-1', name: 'System Admin', description: 'Full system access',
    permissions: { liveView: true, playback: true, alarmAck: true, cameraConfig: true, userManage: true, auditLogs: true, exportEvidence: true, serverConfig: true, roleManage: true, reportGenerate: true }
  },
  {
    id: 'role-2', name: 'Operator', description: 'Day-to-day surveillance operations',
    permissions: { liveView: true, playback: true, alarmAck: true, cameraConfig: false, userManage: false, auditLogs: false, exportEvidence: true, serverConfig: false, roleManage: false, reportGenerate: true }
  },
  {
    id: 'role-3', name: 'Viewer', description: 'Read-only live and playback access',
    permissions: { liveView: true, playback: true, alarmAck: false, cameraConfig: false, userManage: false, auditLogs: false, exportEvidence: false, serverConfig: false, roleManage: false, reportGenerate: false }
  },
  {
    id: 'role-4', name: 'Auditor', description: 'Audit logs and report access',
    permissions: { liveView: false, playback: false, alarmAck: false, cameraConfig: false, userManage: false, auditLogs: true, exportEvidence: true, serverConfig: false, roleManage: false, reportGenerate: true }
  },
  {
    id: 'role-5', name: 'Integrator', description: 'API and integration access',
    permissions: { liveView: true, playback: false, alarmAck: false, cameraConfig: true, userManage: false, auditLogs: false, exportEvidence: false, serverConfig: true, roleManage: false, reportGenerate: false }
  },
];

const PERMISSIONS = [
  { key: 'liveView',       label: 'Ao Vivo',          desc: 'Access live camera feeds' },
  { key: 'playback',       label: 'Reprodução',           desc: 'Review recorded footage' },
  { key: 'alarmAck',       label: 'Alarm Acknowledge',  desc: 'Acknowledge and manage alarms' },
  { key: 'cameraConfig',   label: 'Camera Config',      desc: 'Configure camera settings' },
  { key: 'userManage',     label: 'User Management',    desc: 'Create and edit user accounts' },
  { key: 'auditLogs',      label: 'Logs de Auditoria',         desc: 'Access system audit trail' },
  { key: 'exportEvidence', label: 'Export Evidence',    desc: 'Export clips and evidence packages' },
  { key: 'serverConfig',   label: 'Server Config',      desc: 'Manage NVR server settings' },
  { key: 'roleManage',     label: 'Role Management',    desc: 'Manage roles and permissions' },
  { key: 'reportGenerate', label: 'Relatórios',            desc: 'Generate and export reports' },
];

const roleColor = (r: string) => {
  if (r === 'System Admin') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  if (r === 'Operator')     return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (r === 'Viewer')       return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  if (r === 'Auditor')      return 'bg-green-500/15 text-green-400 border-green-500/30';
  return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
};

export default function PerfisPage() {
  const [roleList, setRoleList] = useState(DEFAULT_ROLES);
  const [editRole, setEditRole] = useState<typeof DEFAULT_ROLES[0] | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});

  const openEdit = (role: typeof DEFAULT_ROLES[0]) => {
    setEditRole(role);
    setEditPerms({ ...role.permissions });
  };

  const saveEdit = () => {
    if (!editRole) return;
    setRoleList(prev => prev.map(r => r.id === editRole.id ? { ...r, permissions: editPerms as typeof r.permissions } : r));
    setEditRole(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Perfis & Permissions</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-52">Permission</th>
                {roleList.map(r => (
                  <th key={r.id} className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="outline" className={cn('text-[10px]', roleColor(r.name))}>{r.name}</Badge>
                      <button onClick={() => openEdit(r)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="h-2.5 w-2.5" />Edit
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((perm, i) => (
                <tr key={perm.key} className={cn('border-b border-border', i % 2 === 0 ? 'bg-transparent' : 'bg-card/30')}>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{perm.label}</p>
                    <p className="text-[10px] text-muted-foreground">{perm.desc}</p>
                  </td>
                  {roleList.map(r => {
                    const allowed = r.permissions[perm.key as keyof typeof r.permissions];
                    return (
                      <td key={r.id} className="px-4 py-3 text-center">
                        {allowed ? (
                          <div className="flex items-center justify-center">
                            <div className="h-5 w-5 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                              <Check className="h-3 w-3 text-green-400" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <div className="h-5 w-5 rounded-full bg-slate-500/10 border border-border flex items-center justify-center">
                              <X className="h-3 w-3 text-muted-foreground/40" />
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!editRole} onOpenChange={o => !o && setEditRole(null)}>
        <SheetContent className="bg-card border-border w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Edit Role: {editRole?.name}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-3">{editRole?.description}</p>
            {PERMISSIONS.map(perm => (
              <label key={perm.key} className="flex items-center justify-between p-2 rounded hover:bg-accent/40 cursor-pointer">
                <div>
                  <p className="text-xs font-medium">{perm.label}</p>
                  <p className="text-[10px] text-muted-foreground">{perm.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={!!editPerms[perm.key]}
                  onChange={e => setEditPerms(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                  className="rounded"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setEditRole(null)} className="h-8 px-4 rounded border border-border text-xs hover:bg-accent">Cancelar</button>
              <button onClick={saveEdit} className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90">Salvar</button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}