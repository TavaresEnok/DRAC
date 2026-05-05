import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  FolderOpen,
  Grid2X2,
  Grid3X3,
  Maximize2,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Search,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { CameraTile } from '../components/CameraTile';
import { Camera, useVmsDataStore } from '../store/vmsDataStore';
import { useGridStore, GridSize } from '../store/gridStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const GRID_CONFIGS: Record<GridSize, { cols: number; rows: number; label: string; icon: ReactNode }> = {
  '1x1': { cols: 1, rows: 1, label: '1x1', icon: <Monitor className="w-3.5 h-3.5" /> },
  '2x2': { cols: 2, rows: 2, label: '2x2', icon: <Grid2X2 className="w-3.5 h-3.5" /> },
  '3x3': { cols: 3, rows: 3, label: '3x3', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
  '4x4': { cols: 4, rows: 4, label: '4x4', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
};

const STATUS_FILTERS = ['All', 'online', 'recording', 'motion', 'alarm', 'offline', 'no_signal', 'maintenance'];

export default function LiveViewPage() {
  const cameras = useVmsDataStore((state) => state.cameras);
  const layouts = useVmsDataStore((state) => state.layouts);
  const { gridSize, cameraIds, wallMode, setGridSize, setCameraIds, toggleWallMode } = useGridStore();
  const [, setLocation] = useLocation();
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const zoneFilters = ['All', ...Array.from(new Set(cameras.map((camera) => camera.zone)))];

  useEffect(() => {
    if (!cameraIds.length && cameras.length) {
      setCameraIds(cameras.slice(0, 4).map((camera) => camera.id));
    }
  }, [cameraIds.length, cameras, setCameraIds]);

  const cfg = GRID_CONFIGS[gridSize];
  const count = cfg.cols * cfg.rows;
  const displayedCams: (Camera | null)[] = cameraIds
    .slice(0, count)
    .map(id => cameras.find(c => c.id === id) ?? null);

  while (displayedCams.length < count) displayedCams.push(null);

  const onlineCount = cameras.filter(c => c.isOnline).length;
  const alarmCount = cameras.filter(c => c.status === 'alarm').length;
  const motionCount = cameras.filter(c => c.status === 'motion').length;

  const filteredList = cameras.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.ipAddress.includes(q);
    const matchZona = zoneFilter === 'All' || c.zone === zoneFilter;
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchZona && matchStatus;
  });

  const handleCamAction = useCallback((action: string, camera: Camera) => {
    if (action === 'playback') setLocation(`/playback?cameraId=${encodeURIComponent(camera.id)}`);
    if (action === 'ptz') setLocation(`/cameras/${camera.id}?tab=ptz`);
    if (action === 'info') setLocation(`/cameras/${camera.id}`);
    if (action === 'fullscreen') {
      setGridSize('1x1');
      setCameraIds([camera.id]);
    }
  }, [setLocation, setGridSize, setCameraIds]);

  const handleCamClick = useCallback((id: string) => {
    setSelectedCam(s => s === id ? null : id);
  }, []);

  const handleCamDoubleClick = useCallback((camera: Camera) => {
    setGridSize('1x1');
    setCameraIds([camera.id]);
  }, [setGridSize, setCameraIds]);

  const loadLayout = (layoutId: string) => {
    const layout = layouts.find(l => l.id === layoutId);
    if (!layout) return;
    setGridSize(layout.gridSize);
    setCameraIds(layout.cameraIds);
  };

  const addCameraToGrid = (camId: string) => {
    const newIds = [...cameraIds];
    const emptyIdx = newIds.slice(0, count).findIndex(id => !cameras.find(c => c.id === id));
    if (emptyIdx >= 0) newIds[emptyIdx] = camId;
    else if (newIds.length < count) newIds.push(camId);
    else newIds[count - 1] = camId;
    setCameraIds(newIds);
  };

  if (wallMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-3 left-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/72 border border-white/10 text-white text-xs font-medium">
          <Video className="w-3.5 h-3.5 text-[hsl(var(--status-online))]" />
          Ao Vivo / Modo Mural
        </div>
        <div
          className="h-full w-full grid gap-0.5 p-0.5"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`, gridTemplateRows: `repeat(${cfg.rows}, 1fr)` }}
        >
          {displayedCams.map((cam, i) => (
            <div key={cam ? cam.id : `empty-${i}`} className="relative min-h-0">
              {cam ? (
                <CameraTile
                  camera={cam}
                  selected={selectedCam === cam.id}
                  onClick={() => handleCamClick(cam.id)}
                  onDoubleClick={() => handleCamDoubleClick(cam)}
                  onAction={handleCamAction}
                />
              ) : (
                <div className="w-full h-full bg-[hsl(210,15%,5%)] flex items-center justify-center">
                  <span className="font-mono text-[10px] text-white/30">SEM SINAL</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={toggleWallMode}
          className="fixed top-3 right-3 z-50 ops-button flex items-center gap-1.5 px-3 text-xs bg-black/72 text-white border-white/10"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Sair do Modo Mural
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="ops-toolbar flex items-center gap-3 px-4 py-2.5 shrink-0">
          <div className="ops-segment flex items-center gap-0.5">
            {(Object.entries(GRID_CONFIGS) as [GridSize, typeof GRID_CONFIGS[GridSize]][]).map(([size, item]) => (
              <Tooltip key={size} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setGridSize(size)}
                    className={`h-7 min-w-12 px-2 rounded-md flex items-center justify-center gap-1.5 text-[10px] font-mono transition-colors ${
                      gridSize === size ? 'ops-segment-active' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'
                    }`}
                    data-testid={`button-grid-${size}`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Grade {item.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="hidden xl:flex items-center gap-2">
            <Select onValueChange={loadLayout}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <FolderOpen className="w-3.5 h-3.5 mr-2 text-[hsl(var(--muted-foreground))]" />
                <SelectValue placeholder="Carregar layout" />
              </SelectTrigger>
              <SelectContent>
                {layouts.map(l => (
                  <SelectItem key={l.id} value={l.id} className="text-xs">
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button className="ops-button flex items-center gap-1.5 px-3 text-xs">
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
          </div>

          <div className="ml-auto hidden md:flex items-center gap-2">
            <span className="ops-chip">
              <span className="w-1.5 h-1.5 rounded-full status-online" />
              {onlineCount}/{cameras.length} ONLINE
            </span>
            <span className="ops-chip">
              <span className="w-1.5 h-1.5 rounded-full status-motion" />
              {motionCount} MOVIMENTO
            </span>
            <span className="ops-chip">
              <span className="w-1.5 h-1.5 rounded-full status-alarm rec-pulse" />
              {alarmCount} ALERTA
            </span>
          </div>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleWallMode}
                className="ops-button w-8 flex items-center justify-center"
                data-testid="button-wall-mode"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Abrir modo mural</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPanelOpen(o => !o)}
                className="ops-button w-8 flex items-center justify-center"
              >
                {panelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{panelOpen ? 'Ocultar painel de câmeras' : 'Mostrar painel de câmeras'}</TooltipContent>
          </Tooltip>
        </div>

        <div
          className="camera-grid-surface flex-1 p-2 grid gap-2 min-h-0"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`, gridTemplateRows: `repeat(${cfg.rows}, 1fr)` }}
        >
          {displayedCams.map((cam, i) => (
            <div key={cam ? cam.id : `empty-${i}`} className="relative min-h-0" style={{ minHeight: 80 }}>
              {cam ? (
                <CameraTile
                  camera={cam}
                  selected={selectedCam === cam.id}
                  onClick={() => handleCamClick(cam.id)}
                  onDoubleClick={() => handleCamDoubleClick(cam)}
                  onAction={handleCamAction}
                />
              ) : (
                <div
                  className="w-full h-full rounded-md border border-dashed border-border/80 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[hsl(var(--primary)_/_0.4)] transition-colors bg-black/20"
                  style={{ minHeight: 80 }}
                >
                  <Video className="w-4 h-4 text-[hsl(var(--muted-foreground)_/_0.45)]" />
                  <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground)_/_0.45)]">SLOT VAZIO</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {panelOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 324, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="border-l border-border bg-card flex flex-col overflow-hidden shrink-0"
          >
            <div className="px-3 py-3 border-b border-border shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-semibold">Diretório de câmeras</h2>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">Atribuição de stream para grade</p>
                </div>
                <ShieldCheck className="w-4 h-4 text-[hsl(var(--status-online))]" />
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="search"
                  placeholder="Buscar por câmera, código ou IP"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-background/60 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] placeholder:text-[hsl(var(--muted-foreground)_/_0.5)]"
                />
              </div>

              <div className="grid grid-cols-[1fr_112px] gap-1.5">
                <Select value={zoneFilter} onValueChange={setZoneFilter}>
                  <SelectTrigger className="h-8 text-[10px]">
                    <Filter className="w-3 h-3 mr-1.5 text-[hsl(var(--muted-foreground))]" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {zoneFilters.map(z => <SelectItem key={z} value={z} className="text-xs">{z}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map(s => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border/80">
              {filteredList.map(cam => {
                const isInGrid = cameraIds.includes(cam.id);
                const statusClass =
                  cam.status === 'alarm' ? 'status-alarm rec-pulse' :
                  cam.status === 'motion' ? 'status-motion' :
                  cam.isOnline ? 'status-online' : 'status-offline';
                return (
                  <button
                    key={cam.id}
                    className={`w-full text-left grid grid-cols-[10px_1fr_auto] items-center gap-2.5 px-3 py-2.5 hover:bg-[hsl(var(--accent)_/_0.7)] transition-colors ${
                      isInGrid ? 'bg-[hsl(var(--primary)_/_0.06)]' : ''
                    }`}
                    onClick={() => addCameraToGrid(cam.id)}
                  >
                    <span className={`w-2 h-2 rounded-full ${statusClass}`} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium truncate">{cam.name}</span>
                      <span className="block font-mono text-[9px] text-[hsl(var(--muted-foreground))] truncate">
                        {cam.code} / {cam.zone} / {cam.ipAddress}
                      </span>
                    </span>
                    <span className={`font-mono text-[9px] shrink-0 ${isInGrid ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground)_/_0.55)]'}`}>
                      {isInGrid ? 'AO VIVO' : cam.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-3 py-2 border-t border-border shrink-0 flex items-center justify-between">
              <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{filteredList.length} câmeras</span>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex items-center gap-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))] hover:text-foreground transition-colors"
              >
                Recolher <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute right-3 top-[104px] ops-button z-10 w-8 flex items-center justify-center"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
