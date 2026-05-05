import { useState } from 'react';
import { ClipboardList, Download, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MOCK_LOGS = [
  { id: 'log-1',  timestamp: '2025-05-03 10:52:01', user: 'mwebb',     action: 'Login',               resource: 'System',              ip: '192.168.0.55', result: 'Success' },
  { id: 'log-2',  timestamp: '2025-05-03 10:43:00', user: 'System',    action: 'Alarm Triggered',     resource: 'Server Room Cam',   ip: '-',            result: 'Success' },
  { id: 'log-3',  timestamp: '2025-05-03 10:42:07', user: 'pnair',     action: 'Alarm Acknowledged',  resource: 'AL-2025-0842',       ip: '192.168.0.60', result: 'Success' },
  { id: 'log-4',  timestamp: '2025-05-03 10:15:00', user: 'System',    action: 'Camera Offline',      resource: 'Parking-NW-02',      ip: '-',            result: 'Warning' },
  { id: 'log-5',  timestamp: '2025-05-03 09:45:12', user: 'mwebb',     action: 'User Modified',       resource: 'dsaunders',           ip: '192.168.0.55', result: 'Success' },
  { id: 'log-6',  timestamp: '2025-05-03 09:30:00', user: 'System',    action: 'Alarm Triggered',     resource: 'Stairwell Cam',      ip: '-',            result: 'Success' },
  { id: 'log-7',  timestamp: '2025-05-03 09:00:05', user: 'jcastillo', action: 'Playback Accessed',   resource: 'Server Room / 2025-05-02', ip: '192.168.0.72', result: 'Success' },
  { id: 'log-8',  timestamp: '2025-05-03 08:55:40', user: 'jcastillo', action: 'Alarm Acknowledged',  resource: 'AL-2025-0841',       ip: '192.168.0.72', result: 'Success' },
  { id: 'log-9',  timestamp: '2025-05-03 07:15:00', user: 'dsaunders', action: 'Login',               resource: 'System',              ip: '192.168.0.88', result: 'Failed' },
  { id: 'log-10', timestamp: '2025-05-03 07:15:10', user: 'dsaunders', action: 'Login',               resource: 'System',              ip: '192.168.0.88', result: 'Failed' },
  { id: 'log-11', timestamp: '2025-05-02 23:50:00', user: 'System',    action: 'Recording Started',   resource: 'NVR-CORE-01',         ip: '-',            result: 'Success' },
  { id: 'log-12', timestamp: '2025-05-02 22:00:00', user: 'rokafor',   action: 'Report Generated',    resource: 'Alarm Summary / Apr', ip: '192.168.0.95', result: 'Success' },
  { id: 'log-13', timestamp: '2025-05-02 18:30:00', user: 'mwebb',     action: 'Camera Added',        resource: 'Exterior Perimeter East', ip: '192.168.0.55', result: 'Success' },
  { id: 'log-14', timestamp: '2025-05-02 17:00:00', user: 'pnair',     action: 'Evidence Exported',   resource: 'INC-2025-0412-01',    ip: '192.168.0.60', result: 'Success' },
  { id: 'log-15', timestamp: '2025-05-02 16:30:00', user: 'mwebb',     action: 'Login',               resource: 'System',              ip: '192.168.0.55', result: 'Success' },
];

const actionTypes = ['Login', 'Logout', 'Alarm Triggered', 'Alarm Acknowledged', 'Camera Offline', 'User Modified', 'Playback Accessed', 'Evidence Exported', 'Camera Added', 'Report Generated', 'Recording Started'];

const resultColor = (r: string) => {
  if (r === 'Success') return 'bg-green-500/15 text-green-400 border-green-500/30';
  if (r === 'Warning') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-red-500/15 text-red-400 border-red-500/30';
};

export default function AuditLogsPage() {
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch] = useState('');

  const users = ['all', ...Array.from(new Set(MOCK_LOGS.map(l => l.user)))];

  const filtered = MOCK_LOGS.filter(l => {
    if (filterUser !== 'all' && l.user !== filterUser) return false;
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (search && !l.action.toLowerCase().includes(search.toLowerCase()) && !l.resource.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Audit Logs</h1>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search action/resource..."
            className="h-7 px-3 rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary w-44"
          />
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-32 h-7 text-xs bg-card border-border">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => <SelectItem key={u} value={u} className="text-xs font-mono">{u === 'all' ? 'All Users' : u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-40 h-7 text-xs bg-card border-border">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Actions</SelectItem>
              {actionTypes.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <button className="flex items-center gap-1.5 h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">
            <Download className="h-3.5 w-3.5" />Export
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              {['Timestamp', 'User', 'Action', 'Resource', 'IP Address', 'Result'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={log.id} className={cn(
                'border-b border-border transition-colors text-xs',
                i % 2 === 0 ? 'bg-transparent hover:bg-accent/40' : 'bg-card/30 hover:bg-accent/40',
                log.result === 'Failed' && 'bg-red-500/5'
              )}>
                <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">{log.timestamp}</td>
                <td className="px-4 py-2 font-mono font-medium">{log.user}</td>
                <td className="px-4 py-2">{log.action}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground max-w-xs truncate">{log.resource}</td>
                <td className="px-4 py-2 font-mono text-muted-foreground">{log.ip}</td>
                <td className="px-4 py-2">
                  <Badge variant="outline" className={cn('text-[10px]', resultColor(log.result))}>{log.result}</Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">No log entries match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-6 py-2 flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground">{filtered.length} entries &middot; Last updated: {new Date().toISOString().replace('T', ' ').substring(0, 19)}</span>
      </div>
    </div>
  );
}