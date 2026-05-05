import { create } from 'zustand';

interface SidebarState {
  isExpanded: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isExpanded: true,
  toggle: () => set((state) => ({ isExpanded: !state.isExpanded })),
}));
