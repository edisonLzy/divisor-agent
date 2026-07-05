import type {
  AskUserQuestionRequest,
  AskUserQuestionResolution,
} from "@shared/ask-user-question-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export interface AskUserQuestionResolutionSnapshot {
  requestId: string;
  resolution: AskUserQuestionResolution;
  resolvedAt: number;
}

export interface SessionAskUserQuestionState {
  requests: AskUserQuestionRequest[];
  lastResolvedRequest?: AskUserQuestionResolutionSnapshot;
}

export interface AskUserQuestionSlice {
  askUserQuestionStates: Map<string, SessionAskUserQuestionState>;
  getAskUserQuestionState: (sessionId: string) => SessionAskUserQuestionState;
  enqueueAskUserQuestionRequest: (sessionId: string, request: AskUserQuestionRequest) => void;
  resolveAskUserQuestionRequest: (
    sessionId: string,
    requestId: string,
    resolution: AskUserQuestionResolution,
  ) => void;
  clearAskUserQuestionState: (sessionId: string) => void;
}

const EMPTY_STATE: SessionAskUserQuestionState = { requests: [] };

export const createAskUserQuestionSlice: StateCreator<
  MainStoreState,
  [],
  [],
  AskUserQuestionSlice
> = (set, get) => ({
  askUserQuestionStates: new Map(),
  getAskUserQuestionState: (sessionId) => get().askUserQuestionStates.get(sessionId) ?? EMPTY_STATE,
  enqueueAskUserQuestionRequest: (sessionId, request) => {
    set((previous) => {
      const states = new Map(previous.askUserQuestionStates);
      const current = states.get(sessionId) ?? EMPTY_STATE;
      states.set(sessionId, { ...current, requests: [...current.requests, request] });
      return { askUserQuestionStates: states };
    });
  },
  resolveAskUserQuestionRequest: (sessionId, requestId, resolution) => {
    set((previous) => {
      const states = new Map(previous.askUserQuestionStates);
      const current = states.get(sessionId) ?? EMPTY_STATE;
      states.set(sessionId, {
        requests: current.requests.filter((request) => request.requestId !== requestId),
        lastResolvedRequest: { requestId, resolution, resolvedAt: Date.now() },
      });
      return { askUserQuestionStates: states };
    });
  },
  clearAskUserQuestionState: (sessionId) => {
    set((previous) => {
      const states = new Map(previous.askUserQuestionStates);
      states.delete(sessionId);
      return { askUserQuestionStates: states };
    });
  },
});
