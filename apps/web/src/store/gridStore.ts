import { create } from 'zustand';

export type GridSize = '1x1' | '2x2' | '3x3' | '4x4';

const GRID_STORAGE_KEY = 'drac.live.grid.v1';

type PersistedGrid = {
  gridSize?: GridSize;
  cameraIds?: string[];
};

function loadPersistedGrid(): PersistedGrid {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GRID_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedGrid;
    const validGridSizes: GridSize[] = ['1x1', '2x2', '3x3', '4x4'];
    return {
      gridSize: parsed.gridSize && validGridSizes.includes(parsed.gridSize) ? parsed.gridSize : undefined,
      cameraIds: Array.isArray(parsed.cameraIds) ? parsed.cameraIds.filter((id) => typeof id === 'string') : undefined,
    };
  } catch {
    return {};
  }
}

function persistGrid(next: PersistedGrid) {
  if (typeof window === 'undefined') return;
  const current = loadPersistedGrid();
  window.localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify({ ...current, ...next }));
}

interface GridState {
  gridSize: GridSize;
  cameraIds: string[];
  wallMode: boolean;
  setGridSize: (size: GridSize) => void;
  setCameraIds: (ids: string[]) => void;
  toggleWallMode: () => void;
}

const persistedGrid = loadPersistedGrid();

export const useGridStore = create<GridState>((set) => ({
  gridSize: persistedGrid.gridSize ?? '2x2',
  cameraIds: persistedGrid.cameraIds ?? [],
  wallMode: false,
  setGridSize: (gridSize) => {
    persistGrid({ gridSize });
    set({ gridSize });
  },
  setCameraIds: (cameraIds) => {
    persistGrid({ cameraIds });
    set({ cameraIds });
  },
  toggleWallMode: () => set((state) => ({ wallMode: !state.wallMode })),
}));
