import { useState } from 'react';
import { MOCK_USERS } from '../data/mockData';
import { Users, Plus, UserX, Unlock, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const roleColor = (r: string) => {
  if (r === 'admin') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  if (r === 'supervisor') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (r === 'operator') return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
};

export default function UsersPage() {
  const [userList, setUserList] = useState(MOCK_USERS);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [search, setSearch] = useState('');

  const filtered = userList.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleLock = (id: string) => {
    setUserList(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">User Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="h-7 px-3 rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary w-44"
          />
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 h-7 px-3 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add User
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              {['Name', 'Badge', 'Email', 'Role', 'Shift', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-6 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr
                key={u.id}
                className={cn('border-b border-border transition-colors',
                  i % 2 === 0 ? 'bg-transparent hover:bg-accent/40' : 'bg-card/30 hover:bg-accent/40',
                  !u.active && 'opacity-60'
                )}
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      {u.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{u.badge}</td>
                <td className="px-6 py-3 text-xs text-muted-foreground">{u.email}</td>
                <td className="px-6 py-3">
                  <Badge variant="outline" className={cn('text-[10px]', roleColor(u.role))}>{u.role}</Badge>
                </td>
                <td className="px-6 py-3 text-xs text-muted-foreground font-mono capitalize">{u.shift}</td>
                <td className="px-6 py-3">
                  <Badge variant="outline" className={cn('text-[10px]',
                    u.active ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
                  )}>{u.active ? 'Active' : 'Locked'}</Badge>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditUser(u)} className="h-6 w-6 rounded border border-border bg-card flex items-center justify-center hover:bg-accent">
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => toggleLock(u.id)}
                      className={cn('h-6 w-6 rounded border flex items-center justify-center transition-colors',
                        !u.active ? 'border-green-500/30 bg-green-500/10 hover:bg-green-500/20' : 'border-border bg-card hover:bg-accent'
                      )}
                    >
                      {!u.active ? <Unlock className="h-3 w-3 text-green-400" /> : <UserX className="h-3 w-3" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={addOpen || !!editUser} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditUser(null); } }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? `Edit User — ${editUser.name}` : 'Add New User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { label: 'Full Name',   placeholder: 'John Doe',            value: editUser?.name ?? '' },
              { label: 'Email',       placeholder: 'jdoe@nexusguard.local',value: editUser?.email ?? '' },
              { label: 'Badge',       placeholder: 'SEC-XXXX',           value: editUser?.badge ?? '' },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{f.label}</label>
                <input defaultValue={f.value} placeholder={f.placeholder} className="w-full h-8 rounded border border-border bg-background text-xs px-3 focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="force-pw" className="rounded" />
              <label htmlFor="force-pw" className="text-xs text-muted-foreground">Force password change on next login</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setAddOpen(false); setEditUser(null); }} className="h-8 px-4 rounded border border-border text-xs hover:bg-accent">Cancel</button>
              <button onClick={() => { setAddOpen(false); setEditUser(null); }} className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90">
                {editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}