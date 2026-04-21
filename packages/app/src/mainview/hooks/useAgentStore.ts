import { create } from 'zustand';

interface AgentState {
  isProcessing: boolean;
  setProcessing: (isProcessing: boolean) => void;
  // TODO: Expand with necessary agent state variables
}

export const useAgentStore = create<AgentState>((set) => ({
  isProcessing: false,
  setProcessing: (isProcessing) => set({ isProcessing }),
}));