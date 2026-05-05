import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { useAlarmStore } from '../store/alarmStore';
import { MOCK_CAMERAS } from '../data/mockData';

export function StatusStrip() {
  const [now, setNow] = useState(new Date());
  const { user } = useAuthStore();
  const { alarms } = useAlarmStore();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeAlarms   = alarms.filter(a => a.status === 'active').length;
  const onlineCameras  = MOCK_CAMERAS.filter(c => c.isOnline).length;
  const totalCameras   = MOCK_CAMERAS.length;
  const systemOk       = activeAlarms === 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-6 flex items-center px-4 border-t border-border bg-sidebar z-40 select-none"
      style={{ fontSize: '10px' }}
    >
      {/* Left: system status */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${systemOk ? 'status-online' : 'status-alarm rec-pulse'}`} />
        <span className="text-[hsl(var(--muted-foreground))] font-mono truncate tracking-wide">
          NexusGuard VMS — Industrial Complex
        </span>
        <span className="text-[hsl(var(--border))] hidden sm:block">│</span>
        <span className="text-[hsl(var(--muted-foreground))] hidden sm:block font-mono">
          System:{' '}
          <span className={systemOk ? 'text-[hsl(var(--status-online))]' : 'text-[hsl(var(--destructive))]'}>
            {systemOk ? 'NOMINAL' : `${activeAlarms} ALARM${activeAlarms !== 1 ? 'S' : ''}`}
          </span>
        </span>
      </div>

      {/* Center: active alarms + cameras */}
      <div className="flex items-center gap-4 px-4">
        {activeAlarms > 0 && (
          <span className="font-mono text-[hsl(var(--destructive)_/_0.85)]">
            {activeAlarms} Active Alarm{activeAlarms !== 1 ? 's' : ''}
          </span>
        )}
        <span className="font-mono text-[hsl(var(--muted-foreground))]">
          <span className="text-[hsl(var(--status-online))]">{onlineCameras}</span>
          <span>/{totalCameras} online</span>
        </span>
      </div>

      {/* Right: user + timestamp */}
      <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
        {user && (
          <>
            <span className="text-[hsl(var(--muted-foreground))] hidden sm:block truncate font-mono">
              {user.name} · <span className="capitalize">{user.role}</span>
            </span>
            <span className="text-[hsl(var(--border))] hidden sm:block">│</span>
          </>
        )}
        <span className="font-mono text-[hsl(var(--muted-foreground))] shrink-0 tabular-nums">
          {format(now, 'yyyy-MM-dd HH:mm:ss')}
        </span>
        <span className="font-mono text-[hsl(var(--border))] shrink-0 hidden md:block">v4.2.1</span>
      </div>
    </div>
  );
}
