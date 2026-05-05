import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera as CameraIcon, PlaySquare, Crosshair, Maximize2, Info, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { Camera } from '../store/vmsDataStore';
import { LiveStreamPlayer } from './LiveStreamPlayer';

interface CameraTileProps {
  camera: Camera;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onAction?: (action: string, camera: Camera) => void;
  compact?: boolean;
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

/* Subtle dark backgrounds — gives each tile a unique depth */
const TILE_BG = [
  'linear-gradient(145deg, hsl(222 22% 9%), hsl(220 20% 12%))',
  'linear-gradient(145deg, hsl(218 20% 8%), hsl(220 18% 11%))',
  'linear-gradient(145deg, hsl(225 18% 9%), hsl(218 20% 12%))',
  'linear-gradient(145deg, hsl(215 22% 8%), hsl(218 18% 11%))',
  'linear-gradient(145deg, hsl(220 20% 9%), hsl(222 18% 12%))',
];

export function CameraTile({ camera, selected, onClick, onDoubleClick, onAction, compact }: CameraTileProps) {
  const [hovered, setHovered] = useState(false);
  const [muted, setMuted] = useState(true);

  const isOffline  = camera.status === 'offline' || camera.status === 'no_signal';
  const isAlarm    = camera.status === 'alarm';
  const isGravação = camera.status === 'recording' || camera.status === 'online';
  const isMotion   = camera.status === 'motion';

  const bgIdx = parseInt(camera.id.replace('cam-', '')) % TILE_BG.length;

  return (
    <motion.div
      className={`relative w-full h-full rounded-sm overflow-hidden cursor-pointer select-none
        ${selected ? 'ring-1 ring-[hsl(var(--primary)_/_0.7)]' : ''}
        ${isAlarm   ? 'alarm-glow ring-1 ring-[hsl(354_50%_50%_/_0.5)]' : ''}
      `}
      style={{ background: TILE_BG[bgIdx], minHeight: compact ? 80 : 120 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.003 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {!isOffline && (
        <div className="absolute inset-0">
          <LiveStreamPlayer cameraId={camera.id} cameraName={camera.name} showOverlay className="h-full w-full" muted={muted} />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10" />

      {/* Subtle scanline — only on live feeds */}
      {!isOffline && <div className="camera-scanline absolute inset-0 overflow-hidden pointer-events-none" />}

      {/* Static noise for lost signal */}
      {camera.status === 'no_signal' && (
        <div className="absolute inset-0 camera-noise opacity-15" />
      )}

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

      {/* Top-left: camera code + status badge */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
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

      {/* Top-right: recording dot + fps */}
      {!isOffline && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1.5">
          {isGravação && (
            <span className="w-1.5 h-1.5 rounded-full rec-pulse" style={{ background: 'hsl(354 50% 50%)' }} />
          )}
          {!compact && (
            <span className="font-mono text-[9px] text-white/35">{camera.fps}fps</span>
          )}
        </div>
      )}

      {/* Bottom gradient + info */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/65 to-transparent">
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

      {/* Hover action bar */}
      <AnimatePresence>
        {hovered && !isOffline && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 py-1.5 px-2 bg-black/75 backdrop-blur-[2px]"
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
            {camera.hasAudio && (
              <button
                className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-[hsl(var(--primary))] hover:bg-white/8 transition-colors"
                onClick={() => setMuted(!muted)}
                title={muted ? 'Ativar áudio' : 'Silenciar'}
              >
                {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
