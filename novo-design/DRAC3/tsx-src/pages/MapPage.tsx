import { useMemo, useState } from 'react';
import { Camera, Eye, Info, PlaySquare, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVmsDataStore, type Camera as VmsCamera } from '../store/vmsDataStore';

const STATUS_COLORS: Record<string, string> = {
  online: 'hsl(150,65%,42%)',
  recording: 'hsl(0,72%,51%)',
  motion: 'hsl(35,95%,55%)',
  alarm: 'hsl(0,72%,51%)',
  offline: 'hsl(var(--muted-foreground))',
  no_signal: 'hsl(var(--muted-foreground))',
  maintenance: 'hsl(35,95%,55%)',
};

type ZonaLayout = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cameras: VmsCamera[];
};

type FloorLayout = {
  id: string;
  name: string;
  zones: ZonaLayout[];
};

function buildFloors(cameras: VmsCamera[]): FloorLayout[] {
  const grouped = new Map<string, VmsCamera[]>();
  for (const camera of cameras) {
    const floorKey = [camera.building, camera.floor].filter(Boolean).join(' / ') || 'Instalação principal';
    const current = grouped.get(floorKey) ?? [];
    current.push(camera);
    grouped.set(floorKey, current);
  }

  return [...grouped.entries()].map(([name, floorCameras], floorIndex) => {
    const zoneMap = new Map<string, VmsCamera[]>();
    for (const camera of floorCameras) {
      const zoneKey = camera.zone || 'Sem zona';
      const current = zoneMap.get(zoneKey) ?? [];
      current.push(camera);
      zoneMap.set(zoneKey, current);
    }

    const zoneEntries = [...zoneMap.entries()];
    const cols = Math.max(1, Math.ceil(Math.sqrt(zoneEntries.length || 1)));
    const cardWidth = 210;
    const cardHeight = 120;
    const gapX = 24;
    const gapY = 22;
    const baseX = 42;
    const baseY = 42;

    const zones = zoneEntries.map(([label, zoneCameras], zoneIndex) => {
      const col = zoneIndex % cols;
      const row = Math.floor(zoneIndex / cols);
      return {
        id: `${floorIndex}-${zoneIndex}`,
        label,
        x: baseX + col * (cardWidth + gapX),
        y: baseY + row * (cardHeight + gapY),
        w: cardWidth,
        h: cardHeight,
        cameras: zoneCameras,
      };
    });

    return {
      id: `floor-${floorIndex}`,
      name,
      zones,
    };
  });
}

function cameraMarkerPosition(index: number, zone: ZonaLayout) {
  const cols = 4;
  const spacingX = 34;
  const spacingY = 28;
  const offsetX = 26;
  const offsetY = 36;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: zone.x + offsetX + col * spacingX,
    y: zone.y + offsetY + row * spacingY,
  };
}

export default function MapPage() {
  const [, setLocation] = useLocation();
  const cameras = useVmsDataStore((state) => state.cameras);
  const [selectedCamera, setSelectedCamera] = useState<VmsCamera | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const floors = useMemo(() => buildFloors(cameras), [cameras]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(floors[0]?.id ?? null);
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) ?? floors[0] ?? null;

  const floorZonaCount = activeFloor?.zones.length ?? 0;
  const floorCameraCount = activeFloor?.zones.reduce((sum, zone) => sum + zone.cameras.length, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 p-4 gap-4">
      <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {floors.map((floor) => (
            <button
              key={floor.id}
              onClick={() => setActiveFloorId(floor.id)}
              className={`px-4 py-2 rounded text-xs font-medium transition-colors ${activeFloor?.id === floor.id ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-border text-[hsl(var(--muted-foreground))] hover:text-foreground hover:bg-[hsl(var(--accent))]'}`}
            >
              {floor.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {['all', 'online', 'recording', 'alarm', 'offline'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1.5 rounded text-[10px] font-mono capitalize transition-colors ${statusFilter === status ? 'bg-[hsl(var(--accent))] text-foreground border border-border' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}
              >
                {status === 'all' ? 'todos' : status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden relative min-h-0">
          {!activeFloor ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Nenhuma planta operacional disponivel.
            </div>
          ) : (
            <svg viewBox="0 0 980 560" className="w-full h-full" style={{ background: 'hsl(210,16%,8%)' }}>
              {Array.from({ length: 22 }, (_, i) => (
                <line key={`h-${i}`} x1="0" y1={i * 26} x2="980" y2={i * 26} stroke="hsl(210,12%,14%)" strokeWidth="1" />
              ))}
              {Array.from({ length: 38 }, (_, i) => (
                <line key={`v-${i}`} x1={i * 26} y1="0" x2={i * 26} y2="560" stroke="hsl(210,12%,14%)" strokeWidth="1" />
              ))}

              <rect x="24" y="24" width="932" height="512" rx="10" fill="none" stroke="hsl(210,12%,18%)" strokeWidth="1.5" />
              <text x="48" y="54" fill="hsl(210,12%,68%)" fontSize="16" fontWeight="600">{activeFloor.name}</text>
              <text x="48" y="76" fill="hsl(210,10%,50%)" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {floorZonaCount} zonas · {floorCameraCount} câmeras mapeadas
              </text>

              {activeFloor.zones.map((zone) => (
                <g key={zone.id}>
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.w}
                    height={zone.h}
                    rx="8"
                    fill="hsl(210,14%,10%)"
                    stroke="hsl(210,12%,22%)"
                    strokeWidth="1.2"
                  />
                  <text
                    x={zone.x + 16}
                    y={zone.y + 18}
                    fill="hsl(210,12%,70%)"
                    fontSize="10"
                    fontFamily="'Inter', sans-serif"
                    fontWeight="600"
                  >
                    {zone.label}
                  </text>
                  <text
                    x={zone.x + zone.w - 16}
                    y={zone.y + 18}
                    textAnchor="end"
                    fill="hsl(185,90%,50%,0.65)"
                    fontSize="9"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {zone.cameras.length} câmeras
                  </text>

                  {zone.cameras
                    .filter((camera) => statusFilter === 'all' || camera.status === statusFilter)
                    .map((camera, index) => {
                      const position = cameraMarkerPosition(index, zone);
                      const color = STATUS_COLORS[camera.status] ?? 'hsl(var(--muted-foreground))';
                      const selected = selectedCamera?.id === camera.id;
                      return (
                        <g
                          key={camera.id}
                          transform={`translate(${position.x}, ${position.y})`}
                          onClick={() => setSelectedCamera((current) => current?.id === camera.id ? null : camera)}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle r={selected ? 9 : 7} fill="hsl(210,16%,8%)" stroke={color} strokeWidth={selected ? 2.2 : 1.6} />
                          <circle r="2.2" fill={color} />
                          {camera.status === 'alarm' && (
                            <circle r="12" fill="none" stroke={color} strokeWidth="1" opacity="0.4">
                              <animate attributeName="r" values="7;14;7" dur="1.5s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite" />
                            </circle>
                          )}
                        </g>
                      );
                    })}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="w-80 shrink-0 rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-xs font-semibold">Detalhes da Câmera</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {selectedCamera ? 'Selecione uma ação para a câmera atual.' : 'Selecione um marcador no mapa.'}
          </div>
        </div>

        {selectedCamera ? (
          <div className="p-4 space-y-4">
            <div className="aspect-video rounded-md border border-border bg-[linear-gradient(145deg,hsl(222_22%_9%),hsl(220_20%_12%))] flex items-center justify-center relative overflow-hidden">
              <Camera className="h-8 w-8 text-muted-foreground/40" />
              <div className="absolute top-2 left-2 text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded text-white/70">
                {selectedCamera.code}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Nome</span><span className="text-right">{selectedCamera.name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Zona</span><span className="text-right">{selectedCamera.zone}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Endereço IP</span><span className="font-mono text-right">{selectedCamera.ipAddress}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="capitalize">{selectedCamera.status.replace('_', ' ')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Gravação</span><span className="capitalize">{selectedCamera.recordingMode}</span></div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button onClick={() => setLocation(`/cameras/${selectedCamera.id}`)} className="h-9 rounded border border-border bg-background hover:bg-accent flex items-center justify-center">
                    <Eye className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Abrir câmera</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button onClick={() => setLocation('/playback')} className="h-9 rounded border border-border bg-background hover:bg-accent flex items-center justify-center">
                    <PlaySquare className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Abrir reprodução</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button onClick={() => setSelectedCamera(null)} className="h-9 rounded border border-border bg-background hover:bg-accent flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Limpar seleção</TooltipContent>
              </Tooltip>
            </div>

            <div className="rounded-md border border-border bg-background/60 p-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">Operacional</span>
              </div>
              <div>Mapa gerado a partir de unidade, andar e zona reais das câmeras cadastradas.</div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-6 text-sm text-muted-foreground text-center">
            Nenhuma câmera selecionada neste andar.
          </div>
        )}
      </div>
    </div>
  );
}
