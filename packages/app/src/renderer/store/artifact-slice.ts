import type { StateCreator } from "zustand/vanilla";

import type {
  ArtifactRecord,
  ArtifactSlice,
  SessionArtifactState,
  SessionsStoreState,
} from "./types";

const EMPTY_ARTIFACT_STATE: SessionArtifactState = {
  activeArtifactId: null,
  artifacts: [],
  isOpen: false,
};

function createEmptyArtifactState(): SessionArtifactState {
  return { ...EMPTY_ARTIFACT_STATE };
}

export const createArtifactSlice: StateCreator<SessionsStoreState, [], [], ArtifactSlice> = (
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

  upsertArtifact: (sessionId, artifact) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(sessionId) ?? createEmptyArtifactState();
      const existingIndex = state.artifacts.findIndex((item) => item.id === artifact.id);
      const nextArtifact: ArtifactRecord = {
        ...artifact,
        updatedAt: Date.now(),
      };
      const artifacts =
        existingIndex >= 0
          ? state.artifacts.map((item, index) => (index === existingIndex ? nextArtifact : item))
          : [...state.artifacts, nextArtifact];
      const isNewArtifact = existingIndex < 0;
      const activeArtifactId =
        isNewArtifact ||
        state.activeArtifactId === null ||
        state.activeArtifactId === nextArtifact.id
          ? nextArtifact.id
          : state.activeArtifactId;

      artifactStates.set(sessionId, {
        activeArtifactId,
        artifacts,
        isOpen: isNewArtifact ? true : state.isOpen,
      });

      return { artifactStates };
    });
  },
});
