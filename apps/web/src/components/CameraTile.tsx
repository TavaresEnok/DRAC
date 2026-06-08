import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlaySquare, Crosshair, Maximize2, Info, AlertTriangle, Circle } from 'lucide-react';
import { Camera } from '../store/vmsDataStore';
import { LiveStreamPlayer } from './LiveStreamPlayer';

import { useGridStore } from '../store/gridStore';

interface CameraTileProps {
  camera: Camera;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onAction?: (action: string, camera: Camera) => void;
  compact?: boolean;
  streamStartDelayMs?: number;
  showDetectionOverlay?: boolean;
  liveViewMode?: 'selected' | 'grid';
}

const STATUS_DOT: Record<string, string> = {
  online:      'hsl(var(--status-online))',
  recording:   'hsl(var(--status-rec))',
  motion:      'hsl(var(--status-motion))',
  alarm:       'hsl(var(--status-alarm))',
  offline:     'hsl(var(--status-offline))',
  no_signal:   'hsl(var(--status-offline))',
  maintenance: 'hsl(var(--status-warning))',
};

export function CameraTile({
  camera,
  selected,
  onClick,
  onDoubleClick,
  onAction,
  compact,
  streamStartDelayMs = 0,
  showDetectionOverlay = false,
  liveViewMode = 'grid',
}: CameraTileProps) {
  const [hovered, setHovered] = useState(false);
  const wallMode = useGridStore((state) => state.wallMode);

  const isOffline  = camera.status === 'offline' || camera.status === 'no_signal';
  const isAlarm    = camera.status === 'alarm';
  const isMotion   = camera.status === 'motion';
  const isManualRecordingActive = camera.status === 'recording';

  return (
    <motion.div
      className={`relative w-full h-full rounded-sm overflow-hidden cursor-pointer select-none
        ${selected ? 'ring-1 ring-[hsl(var(--primary)_/_0.7)]' : ''}
        ${isAlarm   ? 'alarm-glow ring-1 ring-[hsl(var(--status-alarm)_/_0.5)]' : ''}
      `}
      style={{ background: 'hsl(var(--layer-base))', minHeight: compact ? 80 : 120 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      transition={{ duration: 0.12 }}
    >
      {!isOffline && (
        <div className="absolute inset-0">
          <LiveStreamPlayer
            cameraId={camera.id}
            cameraName={camera.name}
            showOverlay={showDetectionOverlay && !wallMode}
            aiEnabled={camera.aiEnabled}
            liveViewMode={liveViewMode}
            className="h-full w-full"
            muted
            startDelayMs={streamStartDelayMs}
          />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10" />

      {/* Offline overlay */}
      {isOffline && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-4 h-4 text-[hsl(var(--status-offline))] mx-auto mb-1" />
            <div className="font-mono text-[9px] text-[hsl(var(--muted-foreground))] tracking-widest uppercase">
              {camera.status === 'no_signal' ? 'Sem sinal' : 'Offline'}
            </div>
          </div>
        </div>
      )}

      {!wallMode && (
        <>
          {/* Top-left: camera code + status badge */}
          <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
            <span className="text-[9px] text-white/60 bg-black/35 px-1.5 py-px rounded-sm">
              {camera.code}
            </span>
            {isAlarm && (
              <span className="text-[9px] text-[hsl(var(--status-alarm))] bg-[hsl(var(--status-alarm)_/_0.18)] border border-[hsl(var(--status-alarm)_/_0.4)] px-1.5 py-px rounded-sm rec-pulse">
                Alarme
              </span>
            )}
            {isMotion && (
              <span className="text-[9px] text-[hsl(var(--status-motion))] bg-[hsl(var(--status-motion)_/_0.15)] border border-[hsl(var(--status-motion)_/_0.35)] px-1.5 py-px rounded-sm">
                Movimento
              </span>
            )}
          </div>

          {/* Bottom gradient + info */}
          <div className="absolute bottom-0 left-0 right-0 z-10 px-2 py-1.5 bg-gradient-to-t from-black/65 to-transparent">
            <div className="flex items-end justify-between gap-1">
              <div className="flex-1 min-w-0">
                <div className={`text-white/90 font-medium truncate ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                  {camera.name}
                </div>
                {!compact && (
                  <div className="flex items-center gap-1 mt-px">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_DOT[camera.status] ?? STATUS_DOT.offline }}
                    />
                    <span className="text-[9px] text-white/45 capitalize">{camera.status.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hover action bar */}
      <AnimatePresence>
        {hovered && !isOffline && !wallMode && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-1 left-2 z-30 flex items-center gap-0.5 rounded-md py-1.5 px-2 bg-black/75 backdrop-blur-[2px]"
            onClick={e => e.stopPropagation()}
          >
            {camera.ptzCapable && (
              <button
                className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-[hsl(var(--primary))] hover:bg-white/8 transition-colors"
                onClick={() => onAction?.('ptz', camera)}
                title="Controle PTZ"
              >
                <Crosshair className="w-3 h-3" />
              </button>
            )}
            <button
              className={`w-6 h-6 flex items-center justify-center rounded border transition-colors ${
                isManualRecordingActive
                  ? 'border-[hsl(var(--destructive)_/_0.6)] bg-[hsl(var(--destructive)_/_0.1)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_0.2)]'
                  : 'border-[hsl(var(--status-online)_/_0.6)] bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))] hover:bg-[hsl(var(--status-online)_/_0.2)]'
              }`}
              onClick={() => onAction?.(isManualRecordingActive ? 'record-stop' : 'record-start', camera)}
              title={isManualRecordingActive ? 'Parar gravação manual' : 'Iniciar gravação manual'}
            >
              <Circle className={`w-3 h-3 ${isManualRecordingActive ? 'fill-current' : ''}`} />
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-[hsl(var(--primary))] hover:bg-white/8 transition-colors"
              onClick={() => onAction?.('playback', camera)}
              title="Reprodução"
            >
              <PlaySquare className="w-3 h-3" />
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-[hsl(var(--primary))] hover:bg-white/8 transition-colors"
              onClick={() => onAction?.('fullscreen', camera)}
              title="Tela cheia"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-[hsl(var(--primary))] hover:bg-white/8 transition-colors"
              onClick={() => onAction?.('info', camera)}
              title="Detalhes da câmera"
            >
              <Info className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
