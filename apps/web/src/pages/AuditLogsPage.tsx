import { useMemo, useState } from 'react';
import { ClipboardList, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVmsDataStore } from '../store/vmsDataStore';

const resultColor = (r: string) => {
  if (r === 'Sucesso') return 'bg-green-500/15 text-green-400 border-green-500/30';
  if (r === 'Atenção') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-red-500/15 text-red-400 border-red-500/30';
};

export default function AuditLogsPage() {
  const logs = useVmsDataStore((state) => state.auditLogs);
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch] = useState('');

  const users = ['all', ...Array.from(new Set(logs.map((log) => log.userId ?? 'system')))];
  const actionTypes = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);

  const filtered = logs.filter(l => {
    const resource = `${l.entityType}${l.entityId ? `:${l.entityId}` : ''}`;
    const user = l.userId ?? 'system';
    if (filterUser !== 'all' && user !== filterUser) return false;
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (search && !l.action.toLowerCase().includes(search.toLowerCase()) && !resource.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Logs de Auditoria</h1>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ação/recurso..."
            className="h-7 px-3 rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary w-44"
          />
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-32 h-7 text-xs bg-card border-border">
              <SelectValue placeholder="Usuário" />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => <SelectItem key={u} value={u} className="text-xs">{u === 'all' ? 'Todos usuários' : u === 'system' ? 'Sistema' : u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-40 h-7 text-xs bg-card border-border">
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas ações</SelectItem>
              {actionTypes.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              {['Data/Hora', 'Usuário', 'Ação', 'Recurso', 'Endereço IP', 'Resultado'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={log.id} className={cn(
                'border-b border-border transition-colors text-xs',
                i % 2 === 0 ? 'bg-transparent hover:bg-accent/40' : 'bg-card/30 hover:bg-accent/40',
                false
              )}>
                <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">{log.createdAt.replace('T', ' ').substring(0, 19)}</td>
                <td className="px-4 py-2 font-medium">{log.userId ?? 'Sistema'}</td>
                <td className="px-4 py-2">{log.action}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground max-w-xs truncate">{log.entityType}{log.entityId ? ` / ${log.entityId}` : ''}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground">{log.ipAddress ?? '-'}</td>
                <td className="px-4 py-2">
                  <Badge variant="outline" className={cn('text-[10px]', resultColor('Sucesso'))}>Sucesso</Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">Nenhum log corresponde aos filtros atuais.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-6 py-2 flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground">{filtered.length} registro(s) &middot; Atualizado em: {new Date().toISOString().replace('T', ' ').substring(0, 19)}</span>
      </div>
    </div>
  );
}
