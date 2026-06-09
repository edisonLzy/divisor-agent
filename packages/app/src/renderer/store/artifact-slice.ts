import { isAgentMessageEntry } from "@renderer/lib/is";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand/vanilla";

import { EntryStatus } from "./types";
import type {
  AgentMessageData,
  ArtifactRecord,
  ArtifactSlice,
  SessionArtifactState,
  SessionsStoreState,
  SideChatArtifactContent,
  SideChatArtifactRecord,
} from "./types";

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

function createSideChatArtifactContent(
  model: SideChatArtifactContent["model"],
  context: SideChatArtifactContent["context"],
  pendingPrompt: string,
): SideChatArtifactContent {
  return {
    pendingPrompt,
    model,
    entries: [],
    status: "idle",
    toolStates: new Map(),
    context,
    createdAt: Date.now(),
  };
}

function isSideChatArtifact(artifact: ArtifactRecord): artifact is SideChatArtifactRecord {
  return artifact.type === "side-chat";
}

function updateSideChatArtifactContent(
  state: SessionArtifactState,
  artifactId: string,
  update: (content: SideChatArtifactContent) => SideChatArtifactContent,
) {
  const artifact = state.artifacts.find((item) => item.id === artifactId);
  if (!artifact || !isSideChatArtifact(artifact)) return state;

  return {
    ...state,
    artifacts: state.artifacts.map((item) =>
      item.id === artifactId
        ? {
            ...artifact,
            content: update(artifact.content),
            updatedAt: Date.now(),
          }
        : item,
    ),
  };
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
      const state = getSessionArtifactState(artifactStates, sessionId);
      const existingIndex = state.artifacts.findIndex((item) => item.id === artifact.id);
      const nextArtifact: ArtifactRecord = {
        ...artifact,
        content: artifact.content,
        name: artifact.name ?? artifact.type,
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
        isOpen: artifacts.length > 0 ? state.isOpen : false,
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

  getSideChatArtifact: (sideChatId) => {
    for (const [mainSessionId, state] of get().artifactStates) {
      const artifact = state.artifacts.find(
        (item): item is SideChatArtifactRecord =>
          item.id === sideChatId && isSideChatArtifact(item),
      );
      if (artifact) return { artifact, mainSessionId };
    }

    return null;
  },

  isSideChatArtifactSession: (sessionId) => {
    return get().getSideChatArtifact(sessionId) !== null;
  },

  createSideChatArtifact: (mainSessionId, context, model, pendingPrompt) => {
    const name =
      context.selectedText.slice(0, 30) + (context.selectedText.length > 30 ? "..." : "");
    const artifactId =
      get()
        .getArtifactState(mainSessionId)
        .artifacts.find((artifact) => artifact.type === "side-chat")?.id ?? uuidv4();

    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = getSessionArtifactState(artifactStates, mainSessionId);
      const existingArtifact = state.artifacts.find((artifact) => artifact.id === artifactId);
      const nextArtifact: SideChatArtifactRecord = {
        id: artifactId,
        name,
        type: "side-chat",
        content:
          existingArtifact && isSideChatArtifact(existingArtifact)
            ? {
                ...existingArtifact.content,
                pendingPrompt,
                context,
                model,
                status: "idle",
              }
            : createSideChatArtifactContent(model, context, pendingPrompt),
        updatedAt: Date.now(),
      };

      const artifacts = existingArtifact
        ? state.artifacts.map((artifact) => (artifact.id === artifactId ? nextArtifact : artifact))
        : [...state.artifacts, nextArtifact];

      artifactStates.set(mainSessionId, {
        activeArtifactId: artifactId,
        artifacts,
        isOpen: true,
      });

      return { artifactStates };
    });

    return artifactId;
  },

  appendSideChatArtifactEntry: (mainSessionId, artifactId, message) => {
    const entryId = uuidv4();
    const artifact = get().getSideChatArtifact(artifactId)?.artifact;
    if (!artifact) return entryId;

    const parentId =
      artifact.content.entries.length > 0
        ? artifact.content.entries[artifact.content.entries.length - 1].id
        : null;

    const messageEntry = {
      id: entryId,
      sessionId: artifactId,
      parentId,
      type: "message" as const,
      timestamp: Date.now(),
      data: message,
      status: EntryStatus.Local,
    };

    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(mainSessionId);
      if (!state) return prev;

      artifactStates.set(
        mainSessionId,
        updateSideChatArtifactContent(state, artifactId, (content) => ({
          ...content,
          entries: [...content.entries, messageEntry],
        })),
      );

      return { artifactStates };
    });

    return entryId;
  },

  updateSideChatArtifactEntry: (mainSessionId, artifactId, entryId, message) => {
    const artifact = get().getSideChatArtifact(artifactId)?.artifact;
    if (!artifact) return;

    const entryIndex = artifact.content.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = artifact.content.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry) || existingEntry.data.role !== "assistant") return;

    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(mainSessionId);
      if (!state) return prev;

      artifactStates.set(
        mainSessionId,
        updateSideChatArtifactContent(state, artifactId, (content) => {
          const entries = [...content.entries];
          entries[entryIndex] = { ...existingEntry, data: message as AgentMessageData };
          return { ...content, entries };
        }),
      );

      return { artifactStates };
    });
  },

  setSideChatArtifactToolState: (mainSessionId, artifactId, toolCallId, toolState) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(mainSessionId);
      if (!state) return prev;

      artifactStates.set(
        mainSessionId,
        updateSideChatArtifactContent(state, artifactId, (content) => {
          const toolStates = new Map(content.toolStates);
          toolStates.set(toolCallId, toolState);
          return { ...content, toolStates };
        }),
      );

      return { artifactStates };
    });
  },

  setSideChatArtifactStatus: (mainSessionId, artifactId, status) => {
    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(mainSessionId);
      if (!state) return prev;

      artifactStates.set(
        mainSessionId,
        updateSideChatArtifactContent(state, artifactId, (content) => ({ ...content, status })),
      );

      return { artifactStates };
    });
  },

  setSideChatArtifactStreamingEntryId: (artifactId, entryId) => {
    set((prev) => {
      const streamingEntryIds = new Map(prev.streamingEntryIds);
      if (entryId === undefined) {
        streamingEntryIds.delete(artifactId);
      } else {
        streamingEntryIds.set(artifactId, entryId);
      }
      return { streamingEntryIds };
    });
  },

  setSideChatArtifactStreamingCompletedAt: (mainSessionId, artifactId) => {
    const entryId = get().streamingEntryIds.get(artifactId);
    if (!entryId) return;

    const artifact = get().getSideChatArtifact(artifactId)?.artifact;
    if (!artifact) return;

    const entryIndex = artifact.content.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = artifact.content.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) return;

    set((prev) => {
      const artifactStates = new Map(prev.artifactStates);
      const state = artifactStates.get(mainSessionId);
      if (!state) return prev;

      artifactStates.set(
        mainSessionId,
        updateSideChatArtifactContent(state, artifactId, (content) => {
          const entries = [...content.entries];
          entries[entryIndex] = { ...existingEntry, completedAt: Date.now() };
          return { ...content, entries };
        }),
      );

      return { artifactStates };
    });
  },
});
