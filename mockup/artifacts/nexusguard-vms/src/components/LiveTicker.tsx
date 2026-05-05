import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Radio } from 'lucide-react';
import { MOCK_CAMERAS } from '../data/mockData';

interface TickerItem {
  id: string;
  label: string;
  camera: string;
  zone: string;
  sev: 'critical' | 'warning' | 'info';
  time: Date;
}

const EVENT_POOL: { label: string; sev: TickerItem['sev'] }[] = [
  { label: 'Motion Detected',    sev: 'info' },
  { label: 'Intrusion Alert',    sev: 'critical' },
  { label: 'Door Open',          sev: 'warning' },
  { label: 'Face Detected',      sev: 'info' },
  { label: 'Tailgating',         sev: 'warning' },
  { label: 'Perimeter Breach',   sev: 'critical' },
  { label: 'Loitering',          sev: 'warning' },
  { label: 'Alarm Triggered',    sev: 'critical' },
  { label: 'Access Violation',   sev: 'warning' },
  { label: 'Camera Tamper',      sev: 'critical' },
  { label: 'Object Left Behind', sev: 'warning' },
  { label: 'PPE Non-Compliance', sev: 'info' },
  { label: 'Vehicle Detected',   sev: 'info' },
  { label: 'Crowd Forming',      sev: 'warning' },
  { label: 'Panic Button',       sev: 'critical' },
];

const SEV_COLOR: Record<TickerItem['sev'], string> = {
  critical: 'hsl(354,52%,65%)',
  warning:  'hsl(38,58%,62%)',
  info:     'hsl(213,65%,68%)',
};

function randomEvent(): TickerItem {
  const cam = MOCK_CAMERAS[Math.floor(Math.random() * MOCK_CAMERAS.length)];
  const evt = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
  return {
    id: `${Date.now()}-${Math.random()}`,
    label: evt.label,
    sev: evt.sev,
    camera: cam.name,
    zone: cam.zone,
    time: new Date(),
  };
}

function seedEvents(n = 14): TickerItem[] {
  return Array.from({ length: n }, (_, i) => ({
    ...randomEvent(),
    time: new Date(Date.now() - (n - i) * 45_000),
  }));
}

export function LiveTicker({ onCriticalEvent }: { onCriticalEvent?: () => void }) {
  const [items, setItems] = useState<TickerItem[]>(seedEvents);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const schedule = () => {
      const delay = 5000 + Math.random() * 4000;
      return setTimeout(() => {
        const next = randomEvent();
        setItems(prev => [next, ...prev].slice(0, 30));
        if (next.sev === 'critical') onCriticalEvent?.();
        timerRef.current = schedule();
      }, delay);
    };
    const timerRef = { current: schedule() };
    return () => clearTimeout(timerRef.current);
  }, [onCriticalEvent]);

  return (
    <div
      className="flex items-stretch h-7 border-b border-[hsl(var(--border)_/_0.7)] bg-[hsl(220_20%_7.5%)] overflow-hidden shrink-0 select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-1.5 px-3 border-r border-[hsl(var(--border)_/_0.7)] bg-[hsl(220_22%_6%)] shrink-0">
        <Radio className="w-2.5 h-2.5 text-[hsl(var(--status-online))] rec-pulse" />
        <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-[hsl(var(--muted-foreground)_/_0.7)] uppercase">
          Live Feed
        </span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex items-center h-full whitespace-nowrap"
          style={{ animation: `ticker-scroll 80s linear infinite`, animationPlayState: paused ? 'paused' : 'running' }}
        >
          {[items, items].map((set, dupe) => (
            <span key={dupe} className="inline-flex items-center">
              {set.map((item) => (
                <span key={`${dupe}-${item.id}`} className="inline-flex items-center gap-2 px-5">
                  <span className="w-1 h-1 rounded-full shrink-0 inline-block" style={{ background: SEV_COLOR[item.sev] }} />
                  <span className="font-mono text-[10px] font-medium" style={{ color: SEV_COLOR[item.sev] }}>
                    {item.label}
                  </span>
                  <span className="text-[10px] text-[hsl(var(--foreground)_/_0.75)]">{item.camera}</span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground)_/_0.55)]">{item.zone}</span>
                  <span className="font-mono text-[9px] text-[hsl(var(--muted-foreground)_/_0.4)] tabular-nums">
                    {format(item.time, 'HH:mm:ss')}
                  </span>
                  <span className="text-[hsl(var(--border))] mx-1">╱</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div
        className="absolute right-0 top-0 h-7 w-16 pointer-events-none"
        style={{ background: 'linear-gradient(to left, hsl(220 20% 7.5%), transparent)' }}
      />
    </div>
  );
}
