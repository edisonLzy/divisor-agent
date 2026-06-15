import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export type ArtifactType = "side-chat" | string;

export interface ArtifactRecord<
  TContent extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  name: string;
  type: ArtifactType;
  content: TContent;
}

export interface SessionArtifactState {
  activeArtifactId: string | null;
  artifacts: ArtifactRecord[];
  isOpen: boolean;
}

export interface UpsertArtifactOptions {
  activateOnCreate?: boolean;
  activateOnUpdate?: boolean;
  openOnCreate?: boolean;
}

export interface ArtifactSlice {
  artifactStates: Map<string, SessionArtifactState>;
  getArtifactState: (sessionId: string) => SessionArtifactState;
  setArtifactPanelOpen: (sessionId: string, isOpen: boolean) => void;
  setActiveArtifactId: (sessionId: string, artifactId: string | null) => void;
  removeArtifact: (sessionId: string, artifactId: string) => void;
  reorderArtifacts: (sessionId: string, sourceIndex: number, targetIndex: number) => void;
  upsertArtifact: <TContent extends Record<string, unknown> = Record<string, unknown>>(
    sessionId: string,
    artifact: Omit<ArtifactRecord<TContent>, "content" | "name"> &
      Partial<Pick<ArtifactRecord<TContent>, "content" | "name">>,
    options?: UpsertArtifactOptions,
  ) => void;
}

const EMPTY_ARTIFACT_STATE: SessionArtifactState = {
  activeArtifactId: null,
  artifacts: [],
  isOpen: false,
};

function createEmptyArtifactState(): SessionArtifactState {
  return { ...EMPTY_ARTIFACT_STATE };
}

function getSessionArtifactState(
  artifactStates: Map<string, SessionArtifactState>,
  sessionId: string,
) {
  return artifactStates.get(sessionId) ?? createEmptyArtifactState();
}

export const createArtifactSlice: StateCreator<MainStoreState, [], [], ArtifactSlice> = (
  set,
  get,
) => ({
  artifactStates: new Map(),

  getArtifactState: (sessionId) => {
    return get().artifactStates.get(sessionId) ?? EMPTY_ARTIFACT_STATE;
  },

  setArtifactPanelOpen: (sessionId, isOpen) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(sessionId) ?? createEmptyArtifactState();
      artifactStates.set(sessionId, { ...state, isOpen });
      return { artifactStates };
    });
  },

  setActiveArtifactId: (sessionId, artifactId) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(sessionId) ?? createEmptyArtifactState();
      artifactStates.set(sessionId, {
        ...state,
        activeArtifactId: artifactId,
        isOpen: artifactId !== null ? true : state.isOpen,
      });
      return { artifactStates };
    });
  },

  upsertArtifact: (sessionId, artifact, options = {}) => {
    set((prev) => {
      const { activateOnCreate = true, activateOnUpdate = false, openOnCreate = true } = options;
      const artifactStates = new Map(prev.artifactStates);
      const state = getSessionArtifactState(artifactStates, sessionId);
      const existingIndex = state.artifacts.findIndex((item) => item.id === artifact.id);
      const nextArtifact: ArtifactRecord = {
        ...artifact,
        content: artifact.content ?? {},
        name: artifact.name ?? artifact.type,
      };
      const artifacts =
        existingIndex >= 0
          ? state.artifacts.map((item, index) => (index === existingIndex ? nextArtifact : item))
          : [...state.artifacts, nextArtifact];
      const isNewArtifact = existingIndex < 0;
      const activeArtifactId =
        (isNewArtifact && activateOnCreate) ||
        (!isNewArtifact && activateOnUpdate) ||
        state.activeArtifactId === nextArtifact.id ||
        (state.activeArtifactId === null && activateOnCreate)
          ? nextArtifact.id
          : state.activeArtifactId;

      artifactStates.set(sessionId, {
        activeArtifactId,
        artifacts,
        isOpen: isNewArtifact && openOnCreate ? true : state.isOpen,
      });

      return { artifactStates };
    });
  },

  removeArtifact: (sessionId, artifactId) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(sessionId);
      if (!state) return prev;

      const artifacts = state.artifacts.filter((artifact) => artifact.id !== artifactId);
      const activeArtifactId =
        state.activeArtifactId === artifactId ? (artifacts[0]?.id ?? null) : state.activeArtifactId;

      artifactStates.set(sessionId, {
        ...state,
        activeArtifactId,
        artifacts,
        isOpen: state.isOpen,
      });

      const streamingEntryIds = new Map(prev.streamingEntryIds);
      streamingEntryIds.delete(artifactId);

      return { artifactStates, streamingEntryIds };
    });
  },

  reorderArtifacts: (sessionId, sourceIndex, targetIndex) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(sessionId);
      if (!state) return prev;
      if (
        sourceIndex === targetIndex ||
        sourceIndex < 0 ||
        targetIndex < 0 ||
        sourceIndex >= state.artifacts.length ||
        targetIndex >= state.artifacts.length
      ) {
        return prev;
      }

      const artifacts = [...state.artifacts];
      const [moved] = artifacts.splice(sourceIndex, 1);
      if (!moved) return prev;
      artifacts.splice(targetIndex, 0, moved);
      artifactStates.set(sessionId, { ...state, artifacts });
      return { artifactStates };
    });
  },
});
