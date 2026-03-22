import type { SessionNode, HistoryMessage, ModelInfo } from '@divisor-agent/server';

export type { ModelInfo };

export interface AgentMessageChunk {
  type: 'text_delta' | 'thinking_delta';
  delta: string;
  chunkIndex: number;
}

export interface ApprovalRequest {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}

export interface StreamingState {
  sessionId: string;
  textContent: string;
  thinkingContent: string;
}

export interface AppState {
  sessions: SessionNode[];
  activeSessionId: string | null;
  messages: Map<string, HistoryMessage[]>;
  streaming: StreamingState | null;
  pendingApproval: ApprovalRequest | null;
  /** Models fetched from the server (built-in + custom from models.json) */
  availableModels: ModelInfo[];
  /** The model chosen for the next session (or model selector default) */
  selectedModel: ModelInfo | null;
  /** Per-session model override, keyed by sessionId */
  sessionModels: Map<string, ModelInfo>;
}

export type AppAction =
  | { type: 'SET_SESSIONS'; sessions: SessionNode[] }
  | { type: 'SET_ACTIVE_SESSION'; sessionId: string }
  | { type: 'SET_MESSAGES'; sessionId: string; messages: HistoryMessage[] }
  | { type: 'APPEND_MESSAGE'; sessionId: string; message: HistoryMessage }
  | { type: 'STREAMING_START'; sessionId: string }
  | { type: 'STREAMING_CHUNK'; chunk: AgentMessageChunk }
  | { type: 'STREAMING_DONE'; sessionId: string }
  | { type: 'SET_PENDING_APPROVAL'; request: ApprovalRequest }
  | { type: 'CLEAR_PENDING_APPROVAL' }
  | { type: 'SET_AVAILABLE_MODELS'; models: ModelInfo[] }
  | { type: 'SET_SELECTED_MODEL'; model: ModelInfo }
  | { type: 'SET_SESSION_MODEL'; sessionId: string; model: ModelInfo };

export const initialState: AppState = {
  sessions: [],
  activeSessionId: null,
  messages: new Map(),
  streaming: null,
  pendingApproval: null,
  availableModels: [],
  selectedModel: null,
  sessionModels: new Map(),
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };

    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.sessionId };

    case 'SET_MESSAGES': {
      const messages = new Map(state.messages);
      messages.set(action.sessionId, action.messages);
      return { ...state, messages };
    }

    case 'APPEND_MESSAGE': {
      const messages = new Map(state.messages);
      const existing = messages.get(action.sessionId) ?? [];
      messages.set(action.sessionId, [...existing, action.message]);
      return { ...state, messages };
    }

    case 'STREAMING_START':
      return {
        ...state,
        streaming: { sessionId: action.sessionId, textContent: '', thinkingContent: '' },
      };

    case 'STREAMING_CHUNK': {
      if (!state.streaming) return state;
      if (action.chunk.type === 'text_delta') {
        return {
          ...state,
          streaming: {
            ...state.streaming,
            textContent: state.streaming.textContent + action.chunk.delta,
          },
        };
      }
      return {
        ...state,
        streaming: {
          ...state.streaming,
          thinkingContent: state.streaming.thinkingContent + action.chunk.delta,
        },
      };
    }

    case 'STREAMING_DONE':
      return { ...state, streaming: null };

    case 'SET_PENDING_APPROVAL':
      return { ...state, pendingApproval: action.request };

    case 'CLEAR_PENDING_APPROVAL':
      return { ...state, pendingApproval: null };

    case 'SET_AVAILABLE_MODELS':
      return { ...state, availableModels: action.models };

    case 'SET_SELECTED_MODEL':
      return { ...state, selectedModel: action.model };

    case 'SET_SESSION_MODEL': {
      const sessionModels = new Map(state.sessionModels);
      sessionModels.set(action.sessionId, action.model);
      return { ...state, sessionModels };
    }

    default:
      return state;
  }
}
