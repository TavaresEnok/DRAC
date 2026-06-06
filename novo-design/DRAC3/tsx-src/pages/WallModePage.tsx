import { useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, Bell, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVmsDataStore } from '../store/vmsDataStore';

const layouts = [
  { label: '4x4', cols: 4, count: 16 },
  { label: '3x3', cols: 3, count: 9 },
  { label: '2x3', cols: 3, count: 6 },
  { label: '2x2', cols: 2, count: 4 },
];

const statusDot = (s: string) => {
  if (s === 'online' || s === 'recording' || s === 'motion') return 'bg-red-500 rec-pulse';
  if (s === 'alarm') return 'bg-red-500 rec-pulse';
  if (s === 'offline' || s === 'no_signal') return 'bg-slate-600';
  return 'bg-amber-500';
};

const statusOverlay = (s: string) => {
  if (s === 'offline' || s === 'no_signal') return { label: 'SEM SINAL', cls: 'bg-red-500/20 text-red-400 border-red-500/40' };
  if (s === 'maintenance') return { label: 'MANUTENÇÃO', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
  return null;
};

export default function WallModePage() {
  const [, setLocation] = useLocation();
  const cameras = useVmsDataStore((state) => state.cameras);
  const [layout, setLayout] = useState(layouts[0]);
  const [showBar, setShowBar] = useState(true);

  const displayCams = cameras.slice(0, layout.count);
  const activeAlertas = cameras.filter(c => c.status === 'alarm').length;

  return (
    <div className="h-screen w-full bg-black flex flex-col overflow-hidden">
      {showBar && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 border-b border-slate-800 z-20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/live')}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Sair do Modo Mural
            </button>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1">
              {layouts.map(l => (
                <button
                  key={l.label}
                  onClick={() => setLayout(l)}
                  className={cn(
                    'h-6 px-2 rounded text-[10px] font-mono border transition-colors',
                    layout.label === l.label
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {activeAlertas > 0 && (
              <div className="flex items-center gap-1.5 alarm-blink">
                <Bell className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs text-red-400">{activeAlertas} alerta{activeAlertas === 1 ? '' : 's'} ativo{activeAlertas === 1 ? '' : 's'}</span>
              </div>
            )}
            <span className="text-xs font-mono text-slate-500">
              {new Date().toISOString().replace('T', ' ').substring(0, 19)}
            </span>
            <button
              onClick={() => setShowBar(false)}
              className="text-[10px] text-slate-600 hover:text-slate-400"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

      {!showBar && (
        <button
          onClick={() => setShowBar(true)}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-30 h-5 px-4 rounded-full bg-slate-900/80 border border-slate-700 text-[10px] text-slate-500 hover:text-white hover:bg-slate-800/90 transition-colors"
        >
          Mostrar controles
        </button>
      )}

      <div
        className="flex-1 grid gap-0.5 p-0.5 bg-black"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}
      >
        {displayCams.map(cam => {
          const overlay = statusOverlay(cam.status);
          return (
            <div key={cam.id} className="relative bg-slate-950 overflow-hidden group">
              <div className="absolute inset-0 scan-line-overlay opacity-40" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="h-8 w-8 text-slate-800" />
              </div>

              <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-10">
                <div className={cn('h-1.5 w-1.5 rounded-full', statusDot(cam.status))} />
                <span className="max-w-[180px] truncate rounded bg-black/70 px-1 text-[9px] text-white/80">{cam.name}</span>
              </div>

              {overlay && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border', overlay.cls)}>
                    {overlay.label}
                  </span>
                </div>
              )}

              <div className="absolute bottom-1 left-1 right-1 flex justify-between items-center z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="max-w-[160px] truncate rounded bg-black/70 px-1 text-[8px] text-white/60">{cam.zone}</span>
                <span className="text-[8px] font-mono text-white/40 bg-black/70 px-1 rounded">
                  {new Date().toISOString().substring(11, 19)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
