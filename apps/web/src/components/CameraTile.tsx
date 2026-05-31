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

/* Muted, professional status colors — no neon */
const STATUS_DOT: Record<string, string> = {
  online:      'hsl(152 36% 45%)',   /* sage */
  recording:   'hsl(354 50% 50%)',   /* deep crimson */
  motion:      'hsl(38 58% 54%)',    /* amber */
  alarm:       'hsl(354 50% 50%)',   /* deep crimson */
  offline:     'hsl(218 10% 36%)',   /* slate */
  no_signal:   'hsl(218 10% 36%)',
  maintenance: 'hsl(38 58% 54%)',    /* amber */
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
        ${isAlarm   ? 'alarm-glow ring-1 ring-[hsl(354_50%_50%_/_0.5)]' : ''}
      `}
      style={{ background: 'hsl(222 18% 9%)', minHeight: compact ? 80 : 120 }}
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
            <AlertTriangle className="w-4 h-4 text-[hsl(218_10%_40%)] mx-auto mb-1" />
            <div className="font-mono text-[9px] text-[hsl(218_10%_38%)] tracking-widest uppercase">
              {camera.status === 'no_signal' ? 'Sem sinal' : 'Offline'}
            </div>
          </div>
        </div>
      )}

      {!wallMode && (
        <>
          {/* Top-left: camera code + status badge */}
          <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
            <span className="font-mono text-[9px] text-white/55 tracking-wider bg-black/35 px-1.5 py-px rounded-sm">
              {camera.code}
            </span>
            {isAlarm && (
              <span className="font-mono text-[9px] text-[hsl(354_55%_68%)] bg-[hsl(354_50%_50%_/_0.18)] border border-[hsl(354_50%_50%_/_0.4)] px-1.5 py-px rounded-sm rec-pulse">
                ALARM
              </span>
            )}
            {isMotion && (
              <span className="font-mono text-[9px] text-[hsl(38_60%_68%)] bg-[hsl(38_58%_54%_/_0.15)] border border-[hsl(38_58%_54%_/_0.35)] px-1.5 py-px rounded-sm">
                MOTION
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
                      style={{ backgroundColor: STATUS_DOT[camera.status] }}
                    />
                    <span className="font-mono text-[9px] text-white/40 capitalize">{camera.status.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
              {!compact && !isOffline && (
                <span className="font-mono text-[9px] text-white/30 shrink-0">{camera.resolution.split(' ')[0]}</span>
              )}
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
                  ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                  : 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
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
