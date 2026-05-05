import { Camera, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CameraTileProps {
  id: string;
  name: string;
  ip?: string;
  resolution?: string;
  status: 'online' | 'offline' | 'warning';
  isRecording?: boolean;
  compact?: boolean;
}

export function CameraTile({
  id,
  name,
  ip,
  resolution,
  status,
  isRecording,
  compact,
}: CameraTileProps) {
  const isOffline = status === 'offline';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/40 bg-layer-base group cursor-pointer',
        'hover:border-border/70 transition-colors',
        compact ? 'aspect-video' : 'h-full'
      )}
      data-testid={`camera-tile-${id}`}
    >
      {/* Scanline overlay */}
      {!isOffline && <div className="camera-scanline absolute inset-0 z-10 pointer-events-none" />}

      {/* Noise overlay for offline */}
      {isOffline && (
        <div className="absolute inset-0 camera-noise opacity-40 z-0" />
      )}

      {/* Gradient placeholder surface */}
      <div
        className={cn(
          'absolute inset-0 opacity-60',
          isOffline ? 'bg-[hsl(var(--muted))]' : 'bg-gradient-to-br from-[hsl(var(--primary)_/_0.06)] to-[hsl(var(--accent)_/_0.04)]'
        )}
      />

      {/* Camera icon center */}
      <div className="absolute inset-0 flex items-center justify-center z-0">
        {isOffline ? (
          <WifiOff className="w-6 h-6 text-[hsl(var(--muted-foreground)_/_0.25)]" />
        ) : (
          <Camera className="w-6 h-6 text-[hsl(var(--primary)_/_0.12)]" />
        )}
      </div>

      {/* Top-left status + name */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            status === 'online' && 'status-online',
            status === 'warning' && 'status-motion rec-pulse',
            status === 'offline' && 'status-offline'
          )}
        />
        <span className="bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-white/90 font-mono truncate max-w-[140px]">
          {name}
        </span>
        {isRecording && (
          <span className="bg-[hsl(var(--destructive)_/_0.85)] px-1 py-px rounded text-[9px] text-white font-mono uppercase tracking-wider">
            REC
          </span>
        )}
      </div>

      {/* Bottom hover overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/65 to-transparent z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/80 font-mono">{ip ?? '—'}</span>
          <span className="text-[10px] text-white/80 font-mono">{resolution ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
