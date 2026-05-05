import { create } from 'zustand';

interface SystemState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
