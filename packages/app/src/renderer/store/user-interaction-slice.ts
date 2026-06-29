import type {
  UserInteractionRequest,
  UserInteractionSubmission,
} from "@shared/user-interaction-ipc";
import type { StateCreator } from "zustand/vanilla";

export interface SessionUserInteractionState {
  requests: UserInteractionRequest[];
}

export interface UserInteractionSlice {
  userInteractionStates: Map<string, SessionUserInteractionState>;
  getUserInteractionState: (sessionId: string) => SessionUserInteractionState;
  enqueueUserInteraction: (sessionId: string, request: UserInteractionRequest) => void;
  resolveUserInteraction: (
    sessionId: string,
    requestId: string,
    submission: UserInteractionSubmission,
  ) => void;
  clearUserInteractionState: (sessionId: string) => void;
}

type UserInteractionSliceCreator<TState extends UserInteractionSlice> = StateCreator<
  TState,
  [],
  [],
  UserInteractionSlice
>;

export function createUserInteractionSlice<TState extends UserInteractionSlice>(
  set: Parameters<UserInteractionSliceCreator<TState>>[0],
  get: Parameters<UserInteractionSliceCreator<TState>>[1],
  _store: Parameters<UserInteractionSliceCreator<TState>>[2],
): UserInteractionSlice {
  return {
    userInteractionStates: new Map(),

    getUserInteractionState: (sessionId) => {
      return get().userInteractionStates.get(sessionId) ?? { requests: [] };
    },

    enqueueUserInteraction: (sessionId, request) => {
      set((previous) => {
        const userInteractionStates = new Map(previous.userInteractionStates);
        const existing = previous.getUserInteractionState(sessionId);
        if (existing.requests.some((candidate) => candidate.requestId === request.requestId)) {
          return previous;
        }

        userInteractionStates.set(sessionId, {
          requests: [...existing.requests, request],
        });
        return { userInteractionStates } as Partial<TState>;
      });
    },

    resolveUserInteraction: (sessionId, requestId) => {
      set((previous) => {
        const userInteractionStates = new Map(previous.userInteractionStates);
        const existing = previous.getUserInteractionState(sessionId);
        userInteractionStates.set(sessionId, {
          requests: existing.requests.filter((request) => request.requestId !== requestId),
        });
        return { userInteractionStates } as Partial<TState>;
      });
    },

    clearUserInteractionState: (sessionId) => {
      set((previous) => {
        const userInteractionStates = new Map(previous.userInteractionStates);
        userInteractionStates.delete(sessionId);
        return { userInteractionStates } as Partial<TState>;
      });
    },
  };
}
