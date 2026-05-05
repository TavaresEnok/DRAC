import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Radio } from 'lucide-react';
import { useVmsDataStore } from '../store/vmsDataStore';

interface TickerItem {
  id: string;
  label: string;
  camera: string;
  zone: string;
  sev: 'critical' | 'warning' | 'info';
  time: Date;
}

const SEV_COLOR: Record<TickerItem['sev'], string> = {
  critical: 'hsl(354,52%,65%)',
  warning:  'hsl(38,58%,62%)',
  info:     'hsl(213,65%,68%)',
};

export function LiveTicker({ onCriticalEvent }: { onCriticalEvent?: () => void }) {
  const events = useVmsDataStore((state) => state.events);
  const cameras = useVmsDataStore((state) => state.cameras);
  const [items, setItems] = useState<TickerItem[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const nextItems = events.slice(0, 30).map((event) => ({
      id: event.id,
      label: event.description,
      camera: event.cameraName,
      zone: cameras.find((camera) => camera.id === event.cameraId)?.zone ?? 'Sem zona',
      sev: event.severity,
      time: new Date(event.timestamp),
    }));
    setItems(nextItems);
    if (nextItems.some((item) => item.sev === 'critical')) onCriticalEvent?.();
  }, [events, cameras, onCriticalEvent]);

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
