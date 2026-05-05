import { create } from 'zustand';
import { MOCK_CAMERAS } from '../data/mockData';

export type GridSize = '1x1' | '2x2' | '3x3' | '4x4';

interface GridState {
  gridSize: GridSize;
  cameraIds: string[];
  wallMode: boolean;
  setGridSize: (size: GridSize) => void;
  setCameraIds: (ids: string[]) => void;
  toggleWallMode: () => void;
}

export const useGridStore = create<GridState>((set) => ({
  gridSize: '2x2',
  cameraIds: MOCK_CAMERAS.slice(0, 4).map(c => c.id),
  wallMode: false,
  setGridSize: (gridSize) => set({ gridSize }),
  setCameraIds: (cameraIds) => set({ cameraIds }),
  toggleWallMode: () => set((state) => ({ wallMode: !state.wallMode })),
}));
