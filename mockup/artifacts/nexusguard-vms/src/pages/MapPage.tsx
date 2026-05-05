import { useState } from 'react';
import { Camera, Eye, PlaySquare, X, Info } from 'lucide-react';
import { useLocation } from 'wouter';
import { MOCK_CAMERAS } from '../data/mockData';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Floor plans as abstract zones
const FLOORS: Record<string, {
  name: string;
  zones: { id: string; label: string; x: number; y: number; w: number; h: number }[];
  corridors: { x: number; y: number; w: number; h: number }[];
}> = {
  ground: {
    name: 'Ground Floor',
    zones: [
      { id: 'lobby', label: 'Lobby', x: 80, y: 60, w: 200, h: 140 },
      { id: 'reception', label: 'Reception', x: 320, y: 60, w: 120, h: 80 },
      { id: 'security', label: 'Security Post', x: 320, y: 170, w: 120, h: 60 },
      { id: 'parking', label: 'Parking Structure', x: 80, y: 250, w: 360, h: 100 },
      { id: 'emergency', label: 'Emergency Exit', x: 480, y: 60, w: 80, h: 80 },
      { id: 'loading', label: 'Loading Dock', x: 480, y: 170, w: 80, h: 80 },
      { id: 'stairwell', label: 'Stairwell', x: 600, y: 60, w: 60, h: 80 },
      { id: 'elevator', label: 'Elevator', x: 600, y: 170, w: 60, h: 80 },
    ],
    corridors: [
      { x: 80, y: 200, w: 520, h: 50 },
    ],
  },
  first: {
    name: 'First Floor',
    zones: [
      { id: 'executive', label: 'Executive Floor', x: 80, y: 60, w: 250, h: 150 },
      { id: 'meeting', label: 'Conference Room A', x: 370, y: 60, w: 150, h: 80 },
      { id: 'meeting2', label: 'Conference Room B', x: 370, y: 170, w: 150, h: 80 },
      { id: 'access', label: 'Access Control', x: 560, y: 60, w: 100, h: 80 },
      { id: 'stairwell2', label: 'Stairwell', x: 560, y: 170, w: 50, h: 80 },
      { id: 'elevator2', label: 'Elevator', x: 620, y: 170, w: 40, h: 80 },
    ],
    corridors: [
      { x: 80, y: 210, w: 480, h: 40 },
    ],
  },
  second: {
    name: 'Second Floor',
    zones: [
      { id: 'server', label: 'Server Room', x: 80, y: 60, w: 180, h: 180 },
      { id: 'network', label: 'Network Operations', x: 290, y: 60, w: 200, h: 100 },
      { id: 'storage', label: 'Storage', x: 290, y: 190, w: 200, h: 80 },
      { id: 'perimeter', label: 'Perimeter', x: 530, y: 60, w: 130, h: 210 },
    ],
    corridors: [
      { x: 260, y: 60, w: 30, h: 210 },
    ],
  },
};

// Position cameras on zones - simplified coordinate mapping
function getCameraCoords(camIdx: number, floorId: string) {
  const floor = FLOORS[floorId];
  if (!floor) return null;
  const zones = floor.zones;
  const zone = zones[camIdx % zones.length];
  // Place camera slightly offset within zone
  const x = zone.x + 20 + (camIdx % 3) * 25;
  const y = zone.y + 20 + Math.floor((camIdx % 9) / 3) * 25;
  return { x: Math.min(x, zone.x + zone.w - 20), y: Math.min(y, zone.y + zone.h - 20), zone: zone.label };
}

const STATUS_COLORS: Record<string, string> = {
  online: 'hsl(150,65%,42%)',
  recording: 'hsl(0,72%,51%)',
  motion: 'hsl(35,95%,55%)',
  alarm: 'hsl(0,72%,51%)',
  offline: 'hsl(var(--muted-foreground))',
  no_signal: 'hsl(var(--muted-foreground))',
  maintenance: 'hsl(35,95%,55%)',
};

export default function MapPage() {
  const [, setLocation] = useLocation();
  const [activeFloor, setActiveFloor] = useState('ground');
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<typeof MOCK_CAMERAS[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState('All');

  const floor = FLOORS[activeFloor];
  const floorCams = MOCK_CAMERAS.filter((_, i) => {
    if (activeFloor === 'ground') return i < 16;
    if (activeFloor === 'first') return i >= 16 && i < 32;
    return i >= 32;
  });

  return (
    <div className="flex h-full min-h-0 p-4 gap-4">
      <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
        {/* Floor tabs */}
        <div className="flex items-center gap-1 shrink-0">
          {Object.entries(FLOORS).map(([id, f]) => (
            <button
              key={id}
              onClick={() => setActiveFloor(id)}
              className={`px-4 py-2 rounded text-xs font-medium transition-colors ${activeFloor === id ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-border text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))]'}`}
            >
              {f.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {['All', 'online', 'alarm', 'offline'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1.5 rounded text-[10px] font-mono capitalize transition-colors ${statusFilter === s ? 'bg-[hsl(var(--accent))] text-foreground border border-border' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* SVG Floorplan */}
        <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden relative min-h-0">
          <svg
            viewBox="0 0 740 380"
            className="w-full h-full"
            style={{ background: 'hsl(210,16%,8%)' }}
          >
            {/* Grid lines */}
            {Array.from({ length: 15 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 26} x2="740" y2={i * 26} stroke="hsl(210,12%,14%)" strokeWidth="1" />
            ))}
            {Array.from({ length: 29 }, (_, i) => (
              <line key={`v${i}`} x1={i * 26} y1="0" x2={i * 26} y2="380" stroke="hsl(210,12%,14%)" strokeWidth="1" />
            ))}

            {/* Corridors */}
            {floor.corridors.map((c, i) => (
              <rect
                key={`cor-${i}`}
                x={c.x} y={c.y} width={c.w} height={c.h}
                fill="hsl(210,12%,12%)"
                stroke="hsl(210,12%,20%)"
                strokeWidth="1"
              />
            ))}

            {/* Zones */}
            {floor.zones.map(zone => {
              const isHovered = hoveredZone === zone.id;
              const camCount = floorCams.filter((_, i) => {
                const coords = getCameraCoords(i, activeFloor);
                return coords?.zone === zone.label;
              }).length;
              return (
                <g key={zone.id}>
                  <rect
                    x={zone.x} y={zone.y} width={zone.w} height={zone.h}
                    fill={isHovered ? 'hsl(185,90%,50%,0.06)' : 'hsl(210,14%,10%)'}
                    stroke={isHovered ? 'hsl(185,90%,50%,0.5)' : 'hsl(210,12%,20%)'}
                    strokeWidth={isHovered ? 1.5 : 1}
                    rx="3"
                    onMouseEnter={() => setHoveredZone(zone.id)}
                    onMouseLeave={() => setHoveredZone(null)}
                    style={{ cursor: 'default', transition: 'all 0.15s' }}
                  />
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 - 4}
                    textAnchor="middle"
                    fill="hsl(210,12%,55%)"
                    fontSize="9"
                    fontFamily="'Inter', sans-serif"
                    fontWeight="500"
                  >{zone.label}</text>
                  {camCount > 0 && (
                    <text
                      x={zone.x + zone.w / 2}
                      y={zone.y + zone.h / 2 + 9}
                      textAnchor="middle"
                      fill="hsl(185,90%,50%,0.6)"
                      fontSize="8"
                      fontFamily="'JetBrains Mono', monospace"
                    >{camCount} cam{camCount !== 1 ? 's' : ''}</text>
                  )}
                </g>
              );
            })}

            {/* Camera markers */}
            {floorCams
              .filter(c => statusFilter === 'All' || c.status === statusFilter)
              .map((cam, i) => {
                const coords = getCameraCoords(i, activeFloor);
                if (!coords) return null;
                const color = STATUS_COLORS[cam.status] ?? 'hsl(var(--muted-foreground))';
                const isSelected = selectedCamera?.id === cam.id;
                return (
                  <g
                    key={cam.id}
                    transform={`translate(${coords.x}, ${coords.y})`}
                    onClick={() => setSelectedCamera(s => s?.id === cam.id ? null : cam)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      r={isSelected ? 9 : 7}
                      fill={isSelected ? color : `${color.replace(')', ', 0.15)').replace('hsl(', 'hsl(')}`}
                      stroke={color}
                      strokeWidth={isSelected ? 2 : 1.5}
                    />
                    <text textAnchor="middle" dominantBaseline="central" fontSize="8" fill={color} fontWeight="bold">
                      {cam.ptzCapable ? '⊕' : '●'}
                    </text>
                    {cam.status === 'alarm' && (
                      <circle r="12" fill="none" stroke={color} strokeWidth="1" opacity="0.4">
                        <animate attributeName="r" values="7;14;7" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                );
              })}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 right-3 bg-card/90 border border-border rounded px-3 py-2 backdrop-blur-sm">
            <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Legend</div>
            {[
              { label: 'Online / Recording', color: 'hsl(150,65%,42%)' },
              { label: 'Motion', color: 'hsl(35,95%,55%)' },
              { label: 'Alarm', color: 'hsl(0,72%,51%)' },
              { label: 'Offline / No Signal', color: 'hsl(var(--muted-foreground))' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[9px] text-[hsl(var(--muted-foreground))]">{label}</span>
              </div>
            ))}
          </div>

          {/* Floor label */}
          <div className="absolute top-3 left-3 font-mono text-[10px] text-[hsl(var(--muted-foreground))] bg-card/80 border border-border rounded px-2 py-1 backdrop-blur-sm">
            {floor.name} · {floorCams.length} cameras
          </div>
        </div>
      </div>

      {/* Camera info panel */}
      <div className="w-56 flex flex-col gap-3 shrink-0">
        {selectedCamera ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-xs font-semibold truncate">{selectedCamera.code}</span>
              <button onClick={() => setSelectedCamera(null)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(var(--accent))] transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3 space-y-2.5">
              <div
                className="h-20 rounded border border-border flex items-center justify-center"
                style={{ background: 'hsl(210,15%,8%)' }}
              >
                <Camera className="w-6 h-6 text-[hsl(var(--muted-foreground)_/_0.3)]" />
              </div>
              <div>
                <div className="text-xs font-medium">{selectedCamera.name}</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{selectedCamera.zone}</div>
              </div>
              <div className="space-y-1 text-[11px]">
                {[
                  ['Status', selectedCamera.status.replace('_', ' ')],
                  ['IP', selectedCamera.ipAddress],
                  ['Model', selectedCamera.model.split(' ').slice(0, 2).join(' ')],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">{k}</span>
                    <span className="font-mono text-[10px]">{v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <button onClick={() => setLocation('/live')} className="w-full h-8 rounded border border-border text-[11px] flex items-center justify-center gap-1.5 hover:bg-[hsl(var(--accent))] transition-colors">
                  <Eye className="w-3.5 h-3.5" /> View Live
                </button>
                <button onClick={() => setLocation('/playback')} className="w-full h-8 rounded border border-border text-[11px] flex items-center justify-center gap-1.5 hover:bg-[hsl(var(--accent))] transition-colors">
                  <PlaySquare className="w-3.5 h-3.5" /> Playback
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-4 flex-1">
            <div className="text-xs text-[hsl(var(--muted-foreground))] text-center mt-8">
              <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Click a camera marker to view details
            </div>
          </div>
        )}

        {/* Zone stats */}
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Zone Summary</div>
          {floor.zones.slice(0, 5).map(zone => {
            const count = floorCams.filter((_, i) => getCameraCoords(i, activeFloor)?.zone === zone.label).length;
            const alarms = floorCams.filter((c, i) => getCameraCoords(i, activeFloor)?.zone === zone.label && c.status === 'alarm').length;
            return (
              <div key={zone.id} className="flex items-center justify-between py-1">
                <span className="text-[11px] truncate">{zone.label}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {alarms > 0 && <span className="w-1.5 h-1.5 rounded-full status-alarm rec-pulse" />}
                  <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{count}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
