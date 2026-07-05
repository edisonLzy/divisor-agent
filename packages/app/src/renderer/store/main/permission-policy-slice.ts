import type { PermissionMode } from "@shared/permissions-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export interface SessionPermissionPolicyState {
  mode: PermissionMode;
}

export interface PermissionPolicySlice {
  permissionPolicyStates: Map<string, SessionPermissionPolicyState>;
  getPermissionPolicyState: (sessionId: string) => SessionPermissionPolicyState;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
}

const DEFAULT_PERMISSION_POLICY_STATE: SessionPermissionPolicyState = { mode: "default" };

export const createPermissionPolicySlice: StateCreator<
  MainStoreState,
  [],
  [],
  PermissionPolicySlice
> = (set, get) => ({
  permissionPolicyStates: new Map(),
  getPermissionPolicyState: (sessionId) =>
    get().permissionPolicyStates.get(sessionId) ?? DEFAULT_PERMISSION_POLICY_STATE,
  setPermissionMode: (sessionId, mode) => {
    set((previous) => {
      const permissionPolicyStates = new Map(previous.permissionPolicyStates);
      permissionPolicyStates.set(sessionId, { mode });
      return { permissionPolicyStates };
    });
  },
});
