import { useState } from 'react';
import { FileText, Download, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const reportTypes = ['Alarm Summary', 'Camera Health', 'User Activity', 'Incident Summary', 'Storage Usage'];

const alarmSummaryData = [
  { day: 'Mon', critical: 1, high: 3, medium: 2, low: 5 },
  { day: 'Tue', critical: 0, high: 2, medium: 4, low: 8 },
  { day: 'Wed', critical: 2, high: 1, medium: 3, low: 6 },
  { day: 'Thu', critical: 0, high: 4, medium: 2, low: 4 },
  { day: 'Fri', critical: 1, high: 2, medium: 5, low: 9 },
  { day: 'Sat', critical: 0, high: 0, medium: 1, low: 2 },
  { day: 'Sun', critical: 0, high: 1, medium: 0, low: 1 },
];

const cameraHealthData = [
  { name: 'Online',      value: 42, color: '#22c55e' },
  { name: 'Motion',      value: 3,  color: '#f59e0b' },
  { name: 'Offline',     value: 2,  color: '#ef4444' },
  { name: 'Maintenance', value: 1,  color: '#6b7280' },
];

const userActivityData = [
  { user: 'Marcus Reinholt', logins: 22, alarmAck: 8, playback: 15, exports: 2 },
  { user: 'Priya Nair',      logins: 18, alarmAck: 14, playback: 22, exports: 1 },
  { user: 'James Okafor',    logins: 16, alarmAck: 9, playback: 11, exports: 0 },
  { user: 'David Chen',      logins: 12, alarmAck: 5, playback: 8,  exports: 0 },
  { user: 'Sarah Jenkins',   logins: 10, alarmAck: 7, playback: 6,  exports: 1 },
];

const incidentData = [
  { id: 'INC-2025-0503-01', type: 'Unauthorized Access', camera: 'Server Room Entrance', time: '10:42', severity: 'Critical', status: 'Open' },
  { id: 'INC-2025-0503-02', type: 'Camera Tamper',       camera: 'Stairwell Floor 1',   time: '09:30', severity: 'Medium',   status: 'Open' },
  { id: 'INC-2025-0501-01', type: 'Loitering',           camera: 'Loading Dock-02',      time: '08:55', severity: 'High',     status: 'Closed' },
  { id: 'INC-2025-0430-01', type: 'Line Cross',          camera: 'Exterior Perimeter',   time: '23:11', severity: 'Low',      status: 'Closed' },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState('Alarm Summary');
  const [dateRange, setDateRange] = useState({ from: '2025-04-28', to: '2025-05-03' });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
          <button className="flex items-center gap-1.5 h-7 px-3 rounded border border-border bg-card text-xs hover:bg-accent">
            <Download className="h-3.5 w-3.5" />Export PDF
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Report</span>
          <select value={reportType} onChange={e => setReportType(e.target.value)}
            className="h-7 rounded border border-border bg-card text-xs px-2 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {reportTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">From</span>
          <input type="date" value={dateRange.from} onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
            className="h-7 rounded border border-border bg-card text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
          <span className="text-xs text-muted-foreground">To</span>
          <input type="date" value={dateRange.to} onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
            className="h-7 rounded border border-border bg-card text-xs px-2 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{reportType}</h2>
          <span className="text-xs text-muted-foreground font-mono">{dateRange.from} &rarr; {dateRange.to}</span>
        </div>

        {reportType === 'Alarm Summary' && (
          <>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Critical', count: 4, color: 'text-red-400' },
                { label: 'High',     count: 13, color: 'text-orange-400' },
                { label: 'Medium',   count: 17, color: 'text-amber-400' },
                { label: 'Low',      count: 35, color: 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="bg-card rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold font-mono mt-1 ${s.color}`}>{s.count}</p>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Alarms by Day</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alarmSummaryData}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, fontSize: 10 }} />
                    <Bar dataKey="critical" stackId="a" fill="#ef4444" radius={[0,0,0,0]} />
                    <Bar dataKey="high"     stackId="a" fill="#f97316" radius={[0,0,0,0]} />
                    <Bar dataKey="medium"   stackId="a" fill="#f59e0b" radius={[0,0,0,0]} />
                    <Bar dataKey="low"      stackId="a" fill="#64748b" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {reportType === 'Camera Health' && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Camera Status Distribution</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cameraHealthData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                      {cameraHealthData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 4, fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Recording Health</p>
              <div className="space-y-2 text-xs">
                {['Lobby-CAM-01', 'Server Room Entrance', 'Parking-NW-01', 'Loading Dock-01'].map(c => (
                  <div key={c} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{c}</span>
                    <span className="font-mono text-green-400">100%</span>
                  </div>
                ))}
                {['Loading Dock-02', 'Stairwell Floor 1'].map(c => (
                  <div key={c} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{c}</span>
                    <span className="font-mono text-amber-400">72%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {reportType === 'User Activity' && (
          <div className="bg-card rounded-lg border border-border p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Name', 'Logins', 'Alarm Ack.', 'Playback', 'Exports'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userActivityData.map((u, i) => (
                  <tr key={u.user} className={i % 2 === 0 ? '' : 'bg-card/50'}>
                    <td className="py-2 px-3 font-medium">{u.user}</td>
                    <td className="py-2 px-3 font-mono">{u.logins}</td>
                    <td className="py-2 px-3 font-mono">{u.alarmAck}</td>
                    <td className="py-2 px-3 font-mono">{u.playback}</td>
                    <td className="py-2 px-3 font-mono">{u.exports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'Incident Summary' && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-card">
                <tr>
                  {['Incident ID', 'Type', 'Camera', 'Time', 'Severity', 'Status'].map(h => (
                    <th key={h} className="text-left py-2 px-4 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidentData.map((inc, i) => (
                  <tr key={inc.id} className={`border-b border-border ${i % 2 === 0 ? '' : 'bg-card/40'}`}>
                    <td className="py-2 px-4 font-mono text-primary">{inc.id}</td>
                    <td className="py-2 px-4">{inc.type}</td>
                    <td className="py-2 px-4 text-muted-foreground">{inc.camera}</td>
                    <td className="py-2 px-4 font-mono text-muted-foreground">{inc.time}</td>
                    <td className="py-2 px-4">{inc.severity}</td>
                    <td className="py-2 px-4">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${inc.status === 'Open' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-green-400 border-green-500/30 bg-green-500/10'}`}>
                        {inc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportType === 'Storage Usage' && (
          <div className="text-center p-12 text-muted-foreground text-sm">
            <p>See the Storage page for detailed volume usage and trend charts.</p>
          </div>
        )}
      </div>
    </div>
  );
}