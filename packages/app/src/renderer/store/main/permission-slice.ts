import type {
  PermissionMode,
  PermissionRequest,
  PermissionResolution,
} from "@shared/permissions-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export interface PermissionResolutionSnapshot {
  requestId: string;
  resolution: PermissionResolution;
  resolvedAt: number;
}

export interface SessionPermissionState {
  mode: PermissionMode;
  requests: PermissionRequest[];
  lastResolvedRequest?: PermissionResolutionSnapshot;
}

export interface PermissionSlice {
  permissionStates: Map<string, SessionPermissionState>;
  getPermissionState: (sessionId: string) => SessionPermissionState;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
  enqueuePermissionRequest: (sessionId: string, request: PermissionRequest) => void;
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    resolution: PermissionResolution,
  ) => void;
  clearPermissionState: (sessionId: string) => void;
}

const DEFAULT_PERMISSION_MODE: PermissionMode = "default";

function createDefaultPermissionState(): SessionPermissionState {
  return {
    mode: DEFAULT_PERMISSION_MODE,
    requests: [],
  };
}

function getStoredPermissionState(
  permissionStates: Map<string, SessionPermissionState>,
  sessionId: string,
) {
  return permissionStates.get(sessionId) ?? createDefaultPermissionState();
}

export const createPermissionSlice: StateCreator<MainStoreState, [], [], PermissionSlice> = (
  set,
  get,
) => ({
  permissionStates: new Map(),

  getPermissionState: (sessionId) => {
    return get().permissionStates.get(sessionId) ?? createDefaultPermissionState();
  },

  setPermissionMode: (sessionId, mode) => {
    set((prev) => {
      const permissionStates = new Map(prev.permissionStates);
      const existing = getStoredPermissionState(permissionStates, sessionId);

      permissionStates.set(sessionId, {
        ...existing,
        mode,
      });

      return { permissionStates };
    });
  },

  enqueuePermissionRequest: (sessionId, request) => {
    set((prev) => {
      const permissionStates = new Map(prev.permissionStates);
      const existing = getStoredPermissionState(permissionStates, sessionId);

      permissionStates.set(sessionId, {
        ...existing,
        requests: [...existing.requests, request],
      });

      return { permissionStates };
    });
  },

  resolvePermissionRequest: (sessionId, requestId, resolution: PermissionResolution) => {
    set((prev) => {
      const permissionStates = new Map(prev.permissionStates);
      const existing = getStoredPermissionState(permissionStates, sessionId);

      permissionStates.set(sessionId, {
        ...existing,
        requests: existing.requests.filter((request) => request.requestId !== requestId),
        lastResolvedRequest: {
          requestId,
          resolution,
          resolvedAt: Date.now(),
        },
      });

      return { permissionStates };
    });
  },

  clearPermissionState: (sessionId) => {
    set((prev) => {
      const permissionStates = new Map(prev.permissionStates);
      permissionStates.delete(sessionId);
      return { permissionStates };
    });
  },
});
