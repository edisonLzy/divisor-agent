import type { PermissionMode } from "@shared/permissions-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export interface PermissionModeSlice {
  permissionModes: Map<string, PermissionMode>;
  getPermissionMode: (sessionId: string) => PermissionMode;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
}

export const createPermissionModeSlice: StateCreator<
  MainStoreState,
  [],
  [],
  PermissionModeSlice
> = (set, get) => ({
  permissionModes: new Map(),
  getPermissionMode: (sessionId) => get().permissionModes.get(sessionId) ?? "default",
  setPermissionMode: (sessionId, mode) => {
    set((previous) => {
      const permissionModes = new Map(previous.permissionModes);
      permissionModes.set(sessionId, mode);
      return { permissionModes };
    });
  },
});
