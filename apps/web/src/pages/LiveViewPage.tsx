import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import axios from 'axios';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Circle,
  ChevronDown,
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
  Pencil,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { CameraTile } from '../components/CameraTile';
import { Camera, SavedLayout, useVmsDataStore } from '../store/vmsDataStore';
import { useGridStore, GridSize } from '../store/gridStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/use-toast';

const GRID_CONFIGS: Record<GridSize, { cols: number; rows: number; label: string; icon: ReactNode }> = {
  '1x1': { cols: 1, rows: 1, label: '1x1', icon: <Monitor className="w-3.5 h-3.5" /> },
  '2x2': { cols: 2, rows: 2, label: '2x2', icon: <Grid2X2 className="w-3.5 h-3.5" /> },
  '3x3': { cols: 3, rows: 3, label: '3x3', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
  '4x4': { cols: 4, rows: 4, label: '4x4', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
};

const STATUS_FILTERS = ['all', 'online', 'recording', 'motion', 'alarm', 'offline', 'no_signal', 'maintenance'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: 'Todos',
  online: 'Online',
  recording: 'Gravando',
  motion: 'Movimento',
  alarm: 'Alarme',
  offline: 'Offline',
  no_signal: 'Sem sinal',
  maintenance: 'Manutenção',
};

const LIVE_LAYOUTS_STORAGE_KEY = 'drac.live.layouts.v1';

function loadSavedLayouts(): SavedLayout[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LIVE_LAYOUTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLayout[];
    return Array.isArray(parsed)
      ? parsed.filter((layout) => layout && typeof layout.id === 'string' && Array.isArray(layout.cameraIds))
      : [];
  } catch {
    return [];
  }
}

function persistSavedLayouts(layouts: SavedLayout[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LIVE_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

export default function LiveViewPage() {
  const API_URL = getApiBaseUrl();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const loadData = useVmsDataStore((state) => state.load);
  const generatedLayouts = useVmsDataStore((state) => state.layouts);
  const { gridSize, cameraIds, wallMode, setGridSize, setCameraIds, toggleWallMode } = useGridStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('__all__');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [recordingActionLoading, setRecordingActionLoading] = useState<'start' | 'stop' | null>(null);
  const [recordingOverrides, setRecordingOverrides] = useState<Record<string, boolean>>({});
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => loadSavedLayouts());
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [layoutSelectValue, setLayoutSelectValue] = useState('');
  const [layoutDialog, setLayoutDialog] = useState<{ mode: 'save' | 'rename'; id?: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedLayout | null>(null);

  const zoneFilters = useMemo(
    () => ['__all__', ...Array.from(new Set(cameras.map((camera) => camera.zone)))],
    [cameras],
  );
  const selectedCameraObj = useMemo(
    () => (selectedCam ? cameras.find((camera) => camera.id === selectedCam) ?? null : null),
    [cameras, selectedCam],
  );
  const availableLayouts = savedLayouts.length ? savedLayouts : generatedLayouts;

  const isCameraRecording = useCallback((camera: Camera | null | undefined) => {
    if (!camera) return false;
    const override = recordingOverrides[camera.id];
    if (typeof override === 'boolean') return override;
    return camera.status === 'recording';
  }, [recordingOverrides]);

  const isRecording = isCameraRecording(selectedCameraObj);

  useEffect(() => {
    if (!cameraIds.length && cameras.length) {
      setCameraIds(cameras.slice(0, 4).map((camera) => camera.id));
    }
  }, [cameraIds.length, cameras, setCameraIds]);

  // Reconcilia o override otimista de gravação com o estado real do servidor: assim
  // que camera.status reflete o valor esperado, o override é removido. Sem isso, um
  // override antigo teria precedência permanente e mostraria "Gravando" para sempre.
  useEffect(() => {
    setRecordingOverrides((current) => {
      if (!Object.keys(current).length) return current;
      let changed = false;
      const next = { ...current };
      for (const camera of cameras) {
        if (camera.id in next && next[camera.id] === (camera.status === 'recording')) {
          delete next[camera.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [cameras]);

  const cfg = GRID_CONFIGS[gridSize];
  const count = cfg.cols * cfg.rows;
  const cameraById = useMemo(() => new Map(cameras.map((camera) => [camera.id, camera])), [cameras]);
  const displayedCams = useMemo<(Camera | null)[]>(() => {
    const slots: (Camera | null)[] = cameraIds.slice(0, count).map((id) => cameraById.get(id) ?? null);
    while (slots.length < count) slots.push(null);
    return slots;
  }, [cameraIds, count, cameraById]);

  const onlineCount = useMemo(() => cameras.filter((c) => c.isOnline).length, [cameras]);
  const recordingCount = useMemo(() => cameras.filter((c) => c.status === 'recording').length, [cameras]);
  const alarmCount = useMemo(() => cameras.filter((c) => c.status === 'alarm').length, [cameras]);

  const filteredList = useMemo(() => {
    const q = search.toLowerCase();
    return cameras.filter((c) => {
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.ipAddress.includes(q);
      const matchZona = zoneFilter === '__all__' || c.zone === zoneFilter;
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchZona && matchStatus;
    });
  }, [cameras, search, zoneFilter, statusFilter]);

  const handleCamAction = useCallback((action: string, camera: Camera) => {
    if (action === 'playback') setLocation(`/playback?cameraId=${encodeURIComponent(camera.id)}`);
    if (action === 'ptz') setLocation(`/cameras/${camera.id}?tab=ptz`);
    if (action === 'info') setLocation(`/cameras/${camera.id}`);
    if (action === 'record-start') {
      void (async () => {
        if (!accessToken) return;
        setRecordingOverrides((current) => ({ ...current, [camera.id]: true }));
        try {
          await axios.post(`${API_URL}/cameras/${camera.id}/recording/start`, {}, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          void loadData();
          toast({ title: 'Gravação iniciada', description: camera.name });
        } catch (error) {
          setRecordingOverrides((current) => ({ ...current, [camera.id]: camera.status === 'recording' }));
          toast({ title: 'Erro ao iniciar gravação', description: error instanceof Error ? error.message : 'Falha ao iniciar gravação manual.', variant: 'destructive' });
        }
      })();
    }
    if (action === 'record-stop') {
      void (async () => {
        if (!accessToken) return;
        setRecordingOverrides((current) => ({ ...current, [camera.id]: false }));
        try {
          await axios.post(`${API_URL}/cameras/${camera.id}/recording/stop`, {}, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          void loadData();
          toast({ title: 'Gravação parada', description: camera.name });
        } catch (error) {
          setRecordingOverrides((current) => ({ ...current, [camera.id]: camera.status === 'recording' }));
          toast({ title: 'Erro ao parar gravação', description: error instanceof Error ? error.message : 'Falha ao parar gravação manual.', variant: 'destructive' });
        }
      })();
    }
    if (action === 'fullscreen') {
      setGridSize('1x1');
      setCameraIds([camera.id]);
    }
  }, [API_URL, accessToken, loadData, setLocation, setGridSize, setCameraIds, toast]);

  const handleCamClick = useCallback((id: string) => {
    setSelectedCam(s => s === id ? null : id);
  }, []);

  const handleCamDoubleClick = useCallback((camera: Camera) => {
    setGridSize('1x1');
    setCameraIds([camera.id]);
  }, [setGridSize, setCameraIds]);

  const loadLayout = (layoutId: string) => {
    const layout = availableLayouts.find(l => l.id === layoutId);
    // Reseta o valor do Select para '' para que re-selecionar o mesmo layout
    // dispare onValueChange novamente (Radix não reemite o valor atual).
    setLayoutSelectValue('');
    if (!layout) return;
    setGridSize(layout.gridSize);
    setCameraIds(layout.cameraIds.slice(0, GRID_CONFIGS[layout.gridSize].cols * GRID_CONFIGS[layout.gridSize].rows));
    setSelectedSlotIndex(null);
  };

  const addCameraToGrid = (camId: string) => {
    const newIds = [...cameraIds.slice(0, count)];
    while (newIds.length < count) newIds.push('');
    const previousIdx = newIds.findIndex((id) => id === camId);
    if (previousIdx >= 0) newIds[previousIdx] = '';
    const targetIdx = selectedSlotIndex != null
      ? selectedSlotIndex
      : newIds.findIndex(id => !id || !cameras.find(c => c.id === id));
    newIds[targetIdx >= 0 ? targetIdx : count - 1] = camId;
    setCameraIds(newIds);
    setSelectedSlotIndex(null);
  };

  const removeCameraFromSlot = (slotIndex: number) => {
    const newIds = [...cameraIds.slice(0, count)];
    while (newIds.length < count) newIds.push('');
    newIds[slotIndex] = '';
    setCameraIds(newIds);
    if (selectedSlotIndex === slotIndex) setSelectedSlotIndex(null);
  };

  const selectSlotForCamera = (slotIndex: number, camera?: Camera | null) => {
    setSelectedSlotIndex(slotIndex);
    setPanelOpen(true);
    setSelectedCam(camera?.id ?? null);
  };

  const saveCurrentLayout = () => {
    setLayoutDialog({ mode: 'save', name: `Layout ${savedLayouts.length + 1}` });
  };

  const renameLayout = (layoutId: string) => {
    const layout = savedLayouts.find((item) => item.id === layoutId);
    if (!layout) return;
    setLayoutDialog({ mode: 'rename', id: layoutId, name: layout.name });
  };

  const deleteLayout = (layoutId: string) => {
    const layout = savedLayouts.find((item) => item.id === layoutId);
    if (!layout) return;
    setDeleteTarget(layout);
  };

  const commitLayoutDialog = () => {
    if (!layoutDialog) return;
    const name = layoutDialog.name.trim();
    if (!name) return;

    if (layoutDialog.mode === 'rename' && layoutDialog.id) {
      const nextLayouts = savedLayouts.map((item) => (item.id === layoutDialog.id ? { ...item, name } : item));
      setSavedLayouts(nextLayouts);
      persistSavedLayouts(nextLayouts);
      toast({ title: 'Layout renomeado', description: name });
    } else {
      const nextLayout: SavedLayout = {
        id: `live-layout-${Date.now()}`,
        name,
        gridSize,
        cameraIds: cameraIds.slice(0, count),
        createdBy: useAuthStore.getState().user?.name ?? 'Operador',
        lastUsed: new Date().toISOString(),
      };
      while (nextLayout.cameraIds.length < count) nextLayout.cameraIds.push('');
      const nextLayouts = [nextLayout, ...savedLayouts];
      setSavedLayouts(nextLayouts);
      persistSavedLayouts(nextLayouts);
      toast({ title: 'Layout salvo', description: name });
    }
    setLayoutDialog(null);
  };

  const confirmDeleteLayout = () => {
    if (!deleteTarget) return;
    const nextLayouts = savedLayouts.filter((item) => item.id !== deleteTarget.id);
    setSavedLayouts(nextLayouts);
    persistSavedLayouts(nextLayouts);
    toast({ title: 'Layout apagado', description: deleteTarget.name });
    setDeleteTarget(null);
  };

  const startManualRecording = async () => {
    if (!selectedCameraObj?.id || !accessToken) return;
    setRecordingActionLoading('start');
    setRecordingOverrides((current) => ({ ...current, [selectedCameraObj.id]: true }));
    try {
      await axios.post(`${API_URL}/cameras/${selectedCameraObj.id}/recording/start`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      void loadData();
      toast({ title: 'Gravação iniciada', description: selectedCameraObj.name });
    } catch (error) {
      setRecordingOverrides((current) => ({ ...current, [selectedCameraObj.id]: selectedCameraObj.status === 'recording' }));
      toast({ title: 'Erro ao iniciar gravação', description: error instanceof Error ? error.message : 'Falha ao iniciar gravação manual.', variant: 'destructive' });
    } finally {
      setRecordingActionLoading(null);
    }
  };

  const stopManualRecording = async () => {
    if (!selectedCameraObj?.id || !accessToken) return;
    setRecordingActionLoading('stop');
    setRecordingOverrides((current) => ({ ...current, [selectedCameraObj.id]: false }));
    try {
      await axios.post(`${API_URL}/cameras/${selectedCameraObj.id}/recording/stop`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      void loadData();
      toast({ title: 'Gravação parada', description: selectedCameraObj.name });
    } catch (error) {
      setRecordingOverrides((current) => ({ ...current, [selectedCameraObj.id]: selectedCameraObj.status === 'recording' }));
      toast({ title: 'Erro ao parar gravação', description: error instanceof Error ? error.message : 'Falha ao parar gravação manual.', variant: 'destructive' });
    } finally {
      setRecordingActionLoading(null);
    }
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
                  camera={{
                    ...cam,
                    status: isCameraRecording(cam)
                      ? 'recording'
                      : (cam.status === 'recording' ? 'online' : cam.status),
                  }}
                  selected={selectedCam === cam.id}
                  showDetectionOverlay={selectedCam === cam.id}
                  liveViewMode={selectedCam === cam.id ? 'selected' : 'grid'}
                  onClick={() => handleCamClick(cam.id)}
                  onDoubleClick={() => handleCamDoubleClick(cam)}
                  onAction={handleCamAction}
                  streamStartDelayMs={0}
                />
              ) : (
                <div className="w-full h-full bg-[hsl(210,15%,5%)] flex items-center justify-center">
                  <span className="text-[11px] text-white/35">Sem câmera</span>
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
        <div className="toolbar">
          <div className="segment">
            {(Object.entries(GRID_CONFIGS) as [GridSize, typeof GRID_CONFIGS[GridSize]][]).map(([size, item]) => (
              <Tooltip key={size} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setGridSize(size)}
                    className={`seg-btn ${gridSize === size ? 'active' : ''}`}
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
            <Select value={layoutSelectValue} onValueChange={loadLayout}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <FolderOpen className="w-3.5 h-3.5 mr-2 text-[hsl(var(--muted-foreground))]" />
                <SelectValue placeholder="Carregar layout" />
              </SelectTrigger>
              <SelectContent>
                {availableLayouts.map(l => (
                  <SelectItem key={l.id} value={l.id} className="text-xs">
                    {l.name}
                  </SelectItem>
                ))}
                {!availableLayouts.length && (
                  <SelectItem value="__empty__" disabled className="text-xs">
                    Nenhum layout salvo
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <button className="btn btn-secondary btn-sm btn-icon" title="Gerenciar layouts salvos">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <div className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Layouts salvos
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {savedLayouts.length ? savedLayouts.map((layout) => (
                    <div key={layout.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[hsl(var(--accent))]">
                      <button className="min-w-0 flex-1 text-left" onClick={() => loadLayout(layout.id)}>
                        <span className="block truncate text-xs font-medium">{layout.name}</span>
                        <span className="block font-mono text-[9px] text-[hsl(var(--muted-foreground))]">
                          {layout.gridSize} / {layout.cameraIds.filter(Boolean).length} câmeras
                        </span>
                      </button>
                      <button onClick={() => renameLayout(layout.id)} className="h-7 w-7 rounded border border-border inline-flex items-center justify-center hover:bg-background" title="Renomear">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteLayout(layout.id)} className="h-7 w-7 rounded border border-border inline-flex items-center justify-center hover:bg-[hsl(var(--destructive)_/_0.1)] hover:text-[hsl(var(--destructive))]" title="Apagar">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )) : (
                    <div className="px-2 py-3 text-xs text-[hsl(var(--muted-foreground))]">Salve um layout para ele aparecer aqui.</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <button onClick={saveCurrentLayout} className="btn btn-secondary btn-sm">
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
          </div>

          <div className="ml-auto hidden md:flex items-center gap-2">
            {selectedCameraObj ? (
              <>
                <button
                  onClick={() => void (isRecording ? stopManualRecording() : startManualRecording())}
                  disabled={recordingActionLoading !== null}
                  className={`btn btn-secondary btn-sm ${
                    isRecording
                      ? 'border-[hsl(var(--destructive)_/_0.7)] text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.1)]'
                      : 'border-[hsl(var(--status-online)_/_0.7)] text-[hsl(var(--status-online))] bg-[hsl(var(--status-online)_/_0.1)] hover:bg-[hsl(var(--status-online)_/_0.2)]'
                  }`}
                  title={isRecording ? 'Parar gravação manual' : 'Iniciar gravação manual'}
                >
                  {recordingActionLoading ? (
                    <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  ) : isRecording ? (
                    <span className="w-2 h-2 rounded-full bg-[hsl(var(--destructive))] rec-pulse" />
                  ) : (
                    <Circle className="w-3 h-3" />
                  )}
                  {isRecording ? 'Gravando' : 'Gravar'}
                </button>
              </>
            ) : null}
            <span className="hdr-chip">
              <span className="hdr-chip-dot status-online" />
              {onlineCount}/{cameras.length} online
            </span>
            {recordingCount > 0 && (
              <span className="hdr-chip">
                <span className="hdr-chip-dot status-recording rec-pulse" />
                {recordingCount} REC
              </span>
            )}
            {alarmCount > 0 && (
              <span className="hdr-chip">
                <span className="hdr-chip-dot status-alarm alarm-glow" />
                {alarmCount} ALM
              </span>
            )}
          </div>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleWallMode}
                className="btn btn-secondary btn-sm btn-icon"
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
                className="btn btn-secondary btn-sm btn-icon"
              >
                {panelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{panelOpen ? 'Ocultar painel de câmeras' : 'Mostrar painel de câmeras'}</TooltipContent>
          </Tooltip>
        </div>

        <div
          className="cam-grid-bg flex-1 p-2 grid gap-2 min-h-0"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`, gridTemplateRows: `repeat(${cfg.rows}, 1fr)` }}
        >
          {displayedCams.map((cam, i) => (
            <div
              key={`${i}-${cam ? cam.id : 'empty'}`}
              className={`group relative min-h-0 rounded-md ${selectedSlotIndex === i ? 'ring-2 ring-[hsl(var(--primary))]' : ''}`}
              style={{ minHeight: 80 }}
            >
              {cam ? (
                <>
                  <CameraTile
                    camera={{
                      ...cam,
                      status: isCameraRecording(cam)
                        ? 'recording'
                        : (cam.status === 'recording' ? 'online' : cam.status),
                    }}
                    selected={selectedCam === cam.id}
                    showDetectionOverlay={true}
                    liveViewMode={selectedCam === cam.id ? 'selected' : 'grid'}
                    onClick={() => {
                      handleCamClick(cam.id);
                      setSelectedSlotIndex(i);
                    }}
                    onDoubleClick={() => handleCamDoubleClick(cam)}
                    onAction={handleCamAction}
                    streamStartDelayMs={0}
                  />
                  <div className="absolute top-9 right-1.5 z-40 flex items-center gap-1.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        selectSlotForCamera(i, cam);
                      }}
                      className="h-7 rounded-md border border-white/15 bg-black/70 px-2 text-[10px] font-mono text-white backdrop-blur hover:bg-black"
                      title="Trocar câmera deste quadrado"
                    >
                      Trocar
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeCameraFromSlot(i);
                      }}
                      className="h-7 w-7 rounded-md border border-white/15 bg-black/70 text-white backdrop-blur hover:bg-[hsl(var(--destructive)_/_0.8)]"
                      title="Remover câmera deste quadrado"
                    >
                      <X className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                </>
              ) : (
                <div
                  onClick={() => selectSlotForCamera(i)}
                  className="cam-empty"
                  style={{ minHeight: 80 }}
                >
                  <Video className="w-4 h-4" />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10 }}>
                    {selectedSlotIndex === i ? 'Escolha uma câmera' : 'Slot vazio'}
                  </span>
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
            animate={{ width: 224, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="border-l border-border bg-card flex flex-col overflow-hidden shrink-0"
          >
            <div className="px-2 py-2.5 border-b border-border shrink-0 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[12px] font-semibold">Câmeras</h2>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                    {selectedSlotIndex != null ? `Quadro ${selectedSlotIndex + 1}` : 'Abrir na grade'}
                  </p>
                </div>
                <ShieldCheck className="w-4 h-4 text-[hsl(var(--status-online))]" />
              </div>

              <div className="input-wrap">
                <span className="input-icon"><Search className="w-3 h-3" /></span>
                <input
                  className="input"
                  style={{ height: 30, fontSize: 11 }}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar câmera..."
                />
              </div>

              <Select value={zoneFilter} onValueChange={setZoneFilter}>
                <SelectTrigger className="h-8 text-[10px]">
                  <Filter className="w-3 h-3 mr-1.5 text-[hsl(var(--muted-foreground))]" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zoneFilters.map(z => <SelectItem key={z} value={z} className="text-xs">{z === '__all__' ? 'Todas as zonas' : z}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex flex-wrap gap-1">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`ops-pill ${statusFilter === s ? 'ops-pill-active' : ''}`}
                  >
                    {STATUS_FILTER_LABEL[s]}
                  </button>
                ))}
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
                    className={`w-full text-left grid grid-cols-[10px_1fr_auto] items-center gap-2 px-2 py-2 hover:bg-[hsl(var(--accent)_/_0.7)] transition-colors ${
                      isInGrid ? 'bg-[hsl(var(--primary)_/_0.06)]' : ''
                    }`}
                    onClick={() => addCameraToGrid(cam.id)}
                  >
                    <span className={`w-2 h-2 rounded-full ${statusClass}`} />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium truncate">{cam.name}</span>
                      <span className="block text-[9px] text-[hsl(var(--muted-foreground))] truncate">
                        {cam.code}
                      </span>
                    </span>
                    <span className={`max-w-[42px] truncate text-[9px] shrink-0 ${isInGrid ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground)_/_0.55)]'}`}>
                      {selectedSlotIndex != null ? 'Usar' : isInGrid ? 'Grade' : STATUS_FILTER_LABEL[cam.status as (typeof STATUS_FILTERS)[number]] ?? cam.status.replace('_', ' ')}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-2.5 py-2 border-t border-border shrink-0 flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{filteredList.length} câmeras</span>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-foreground transition-colors"
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
          className="btn btn-secondary btn-sm btn-icon absolute right-3 top-[104px] z-10"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      <Dialog open={layoutDialog !== null} onOpenChange={(open) => { if (!open) setLayoutDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{layoutDialog?.mode === 'rename' ? 'Renomear layout' : 'Salvar layout'}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={layoutDialog?.name ?? ''}
            onChange={(e) => setLayoutDialog((current) => (current ? { ...current, name: e.target.value } : current))}
            onKeyDown={(e) => { if (e.key === 'Enter') commitLayoutDialog(); }}
            placeholder="Nome do layout"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLayoutDialog(null)}>Cancelar</Button>
            <Button onClick={commitLayoutDialog} disabled={!layoutDialog?.name.trim()}>
              {layoutDialog?.mode === 'rename' ? 'Renomear' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar layout</AlertDialogTitle>
            <AlertDialogDescription>
              Apagar o layout "{deleteTarget?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteLayout}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
