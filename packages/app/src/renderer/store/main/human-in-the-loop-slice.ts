import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import type { PermissionRequest, PermissionResolution } from "@shared/permissions-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export type HumanInTheLoopRequest = PermissionRequest | AskUserQuestionRequest;
export type HumanInTheLoopResolution = PermissionResolution | AskUserQuestionResolution;

export interface HumanInTheLoopResolutionSnapshot {
  requestId: string;
  resolution: HumanInTheLoopResolution;
  resolvedAt: number;
}

export interface SessionHumanInTheLoopState {
  requests: HumanInTheLoopRequest[];
  lastResolvedRequest?: HumanInTheLoopResolutionSnapshot;
}

export interface HumanInTheLoopSlice {
  humanInTheLoopStates: Map<string, SessionHumanInTheLoopState>;
  getHumanInTheLoopState: (sessionId: string) => SessionHumanInTheLoopState;
  enqueueHumanInTheLoopRequest: (sessionId: string, request: HumanInTheLoopRequest) => void;
  resolveHumanInTheLoopRequest: (
    sessionId: string,
    requestId: string,
    resolution: HumanInTheLoopResolution,
  ) => void;
  clearHumanInTheLoopState: (sessionId: string) => void;
}

const EMPTY_STATE: SessionHumanInTheLoopState = { requests: [] };

export const createHumanInTheLoopSlice: StateCreator<
  MainStoreState,
  [],
  [],
  HumanInTheLoopSlice
> = (set, get) => ({
  humanInTheLoopStates: new Map(),
  getHumanInTheLoopState: (sessionId) => get().humanInTheLoopStates.get(sessionId) ?? EMPTY_STATE,
  enqueueHumanInTheLoopRequest: (sessionId, request) => {
    set((previous) => {
      const states = new Map(previous.humanInTheLoopStates);
      const current = states.get(sessionId) ?? EMPTY_STATE;
      states.set(sessionId, { ...current, requests: [...current.requests, request] });
      return { humanInTheLoopStates: states };
    });
  },
  resolveHumanInTheLoopRequest: (sessionId, requestId, resolution) => {
    set((previous) => {
      const states = new Map(previous.humanInTheLoopStates);
      const current = states.get(sessionId) ?? EMPTY_STATE;
      states.set(sessionId, {
        requests: current.requests.filter((request) => request.requestId !== requestId),
        lastResolvedRequest: { requestId, resolution, resolvedAt: Date.now() },
      });
      return { humanInTheLoopStates: states };
    });
  },
  clearHumanInTheLoopState: (sessionId) => {
    set((previous) => {
      const states = new Map(previous.humanInTheLoopStates);
      states.delete(sessionId);
      return { humanInTheLoopStates: states };
    });
  },
});
