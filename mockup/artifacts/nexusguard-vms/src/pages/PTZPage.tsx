import { useState } from 'react';
import { Camera, Crosshair, ZoomIn, ZoomOut, Plus, Trash2, Play, Square } from 'lucide-react';
import { MOCK_CAMERAS } from '../data/mockData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const PTZ_CAMERAS = MOCK_CAMERAS.filter(c => c.ptzCapable);

const PRESETS = [
  { id: 'p1', name: 'Home', pan: 0, tilt: 0, zoom: 1 },
  { id: 'p2', name: 'Entrance Overview', pan: -45.5, tilt: -12.8, zoom: 2.4 },
  { id: 'p3', name: 'Parking Overview', pan: 127.3, tilt: -8.2, zoom: 1.8 },
  { id: 'p4', name: 'Loading Bay Close-up', pan: 198.6, tilt: -22.1, zoom: 5.3 },
  { id: 'p5', name: 'Perimeter Sweep', pan: 89.0, tilt: -5.0, zoom: 1.2 },
];

const TOURS = [
  { id: 't1', name: 'Main Patrol Route', presets: ['p1', 'p2', 'p3'], duration: '45s dwell' },
  { id: 't2', name: 'Perimeter Sweep', presets: ['p5', 'p3', 'p4'], duration: '30s dwell' },
];

function DirectionButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <button
      onMouseDown={onPress}
      className="w-12 h-12 flex items-center justify-center rounded border border-border text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary)_/_0.5)] hover:bg-[hsl(var(--primary)_/_0.05)] active:bg-[hsl(var(--primary)_/_0.1)] transition-all select-none"
      title={label}
    >
      {icon}
    </button>
  );
}

export default function PTZPage() {
  const [selectedCamId, setSelectedCamId] = useState(PTZ_CAMERAS[0]?.id ?? '');
  const [pan, setPan] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [speed, setSpeed] = useState(5);
  const [activeTour, setActiveTour] = useState<string | null>(null);

  const selectedCam = PTZ_CAMERAS.find(c => c.id === selectedCamId) ?? PTZ_CAMERAS[0];

  const move = (dPan: number, dTilt: number) => {
    setPan(p => Math.max(-180, Math.min(180, p + dPan * (speed / 5))));
    setTilt(t => Math.max(-90, Math.min(90, t + dTilt * (speed / 5))));
  };

  const goToPreset = (preset: typeof PRESETS[0]) => {
    setPan(preset.pan);
    setTilt(preset.tilt);
    setZoom(preset.zoom);
  };

  return (
    <div className="flex h-full min-h-0 p-4 gap-4">
      {/* Main view + controls */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Camera selector */}
        <div className="flex items-center gap-3 shrink-0">
          <Select value={selectedCamId} onValueChange={setSelectedCamId}>
            <SelectTrigger className="w-80 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PTZ_CAMERAS.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-xs font-mono">{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 font-mono text-xs text-[hsl(var(--muted-foreground))]">
            <span>Speed:</span>
            <div className="w-24">
              <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={1} max={10} step={1} />
            </div>
            <span className="w-4">{speed}</span>
          </div>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Camera preview */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div
              className="relative rounded-lg border border-border overflow-hidden flex-1 min-h-0"
              style={{ minHeight: 200, background: 'hsl(210,18%,7%)' }}
            >
              <div className="camera-scanline absolute inset-0 overflow-hidden pointer-events-none" />
              {/* Crosshair overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-16 h-16 opacity-30">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[hsl(var(--primary))] -translate-x-1/2" />
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-[hsl(var(--primary))] -translate-y-1/2" />
                  <div className="absolute inset-4 border border-[hsl(var(--primary))] rounded-sm" />
                </div>
              </div>
              {/* Camera info */}
              <div className="absolute top-2 left-2 font-mono text-[10px] text-white/50 bg-black/50 px-2 py-1 rounded">
                {selectedCam?.code ?? '—'}
              </div>
              <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end pointer-events-none">
                <span className="font-mono text-xs text-white/60 bg-black/50 px-2 py-1 rounded">
                  {selectedCam?.name}
                </span>
                <div className="font-mono text-[10px] text-white/50 bg-black/50 px-2 py-1 rounded space-y-0.5 text-right">
                  <div>PAN {pan >= 0 ? '+' : ''}{pan.toFixed(1)}°</div>
                  <div>TILT {tilt >= 0 ? '+' : ''}{tilt.toFixed(1)}°</div>
                  <div>ZOOM {zoom.toFixed(1)}x</div>
                </div>
              </div>
            </div>

            {/* Position readout */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              {[
                { label: 'PAN', value: `${pan >= 0 ? '+' : ''}${pan.toFixed(2)}°`, unit: '' },
                { label: 'TILT', value: `${tilt >= 0 ? '+' : ''}${tilt.toFixed(2)}°`, unit: '' },
                { label: 'ZOOM', value: `${zoom.toFixed(1)}`, unit: 'x' },
              ].map(r => (
                <div key={r.label} className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] tracking-widest uppercase mb-1">{r.label}</div>
                  <div className="font-mono text-sm text-[hsl(var(--primary))]">{r.value}{r.unit}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PTZ Controls */}
          <div className="flex flex-col gap-4 items-center shrink-0 w-48">
            {/* D-pad */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="grid grid-cols-3 gap-1">
                <div />
                <DirectionButton label="Up" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>} onPress={() => move(0, 2)} />
                <div />
                <DirectionButton label="Left" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>} onPress={() => move(-2, 0)} />
                <button
                  onClick={() => { setPan(0); setTilt(0); setZoom(1); }}
                  className="w-12 h-12 flex items-center justify-center rounded-full border border-border bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
                  title="Home"
                >
                  <Crosshair className="w-4 h-4" />
                </button>
                <DirectionButton label="Right" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>} onPress={() => move(2, 0)} />
                <div />
                <DirectionButton label="Down" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>} onPress={() => move(0, -2)} />
                <div />
              </div>
            </div>

            {/* Zoom controls */}
            <div className="bg-card border border-border rounded-xl p-3 w-full">
              <div className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] text-center mb-2 tracking-wider">ZOOM</div>
              <div className="flex justify-between gap-2">
                <button
                  onClick={() => setZoom(z => Math.max(1, z - 0.5))}
                  className="flex-1 h-10 flex items-center justify-center rounded border border-border text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom(z => Math.min(16, z + 0.5))}
                  className="flex-1 h-10 flex items-center justify-center rounded border border-border text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2">
                <Slider value={[zoom]} onValueChange={([v]) => setZoom(v)} min={1} max={16} step={0.1} />
              </div>
            </div>

            {/* Focus + Iris */}
            <div className="bg-card border border-border rounded-xl p-3 w-full">
              <div className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] text-center mb-2 tracking-wider">FOCUS / IRIS</div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'Near', icon: '−' },
                  { label: 'Far', icon: '+' },
                  { label: 'Close', icon: '●' },
                  { label: 'Open', icon: '○' },
                ].map(b => (
                  <button key={b.label} className="h-8 flex items-center justify-center rounded border border-border text-[10px] font-mono text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))] transition-colors">
                    <span className="mr-1">{b.icon}</span>{b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel: presets + tours */}
      <div className="w-56 flex flex-col gap-4 shrink-0">
        {/* Presets */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold">Presets</h3>
            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--muted-foreground))]">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border">
            {PRESETS.map(preset => (
              <div key={preset.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[hsl(var(--accent))] transition-colors group">
                <button
                  onClick={() => goToPreset(preset)}
                  className="flex-1 text-left text-xs font-medium hover:text-[hsl(var(--primary))] transition-colors"
                >
                  {preset.name}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="w-5 h-5 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tours */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold">PTZ Tours</h3>
            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--muted-foreground))]">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border">
            {TOURS.map(tour => (
              <div key={tour.id} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{tour.name}</span>
                  <button
                    onClick={() => setActiveTour(a => a === tour.id ? null : tour.id)}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${activeTour === tour.id ? 'text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_0.1)]' : 'text-[hsl(var(--chart-3))] hover:bg-[hsl(var(--chart-3)_/_0.1)]'}`}
                  >
                    {activeTour === tour.id ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                </div>
                <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground))]">
                  {tour.presets.length} presets · {tour.duration}
                </div>
                {activeTour === tour.id && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full status-online rec-pulse" />
                    <span className="text-[10px] text-[hsl(var(--chart-3))]">Tour running</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
