import { createContext, useContext, useMemo, useReducer } from 'react';
import type { PropsWithChildren } from 'react';
import type { PendingApproval, StreamState } from '../types/domain';

interface AppState {
  activeSessionId: string | null;
  pendingApproval: PendingApproval | null;
  streaming: StreamState;
  selectedModelId: string | null;
}

type AppAction =
  | { type: 'setActiveSession'; sessionId: string | null }
  | { type: 'setPendingApproval'; payload: PendingApproval | null }
  | { type: 'setStreaming'; payload: StreamState }
  | { type: 'setSelectedModel'; modelId: string | null };

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const initialState: AppState = {
  activeSessionId: null,
  pendingApproval: null,
  streaming: {
    sessionId: null,
    isStreaming: false,
  },
  selectedModelId: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'setActiveSession':
      return {
        ...state,
        activeSessionId: action.sessionId,
      };
    case 'setPendingApproval':
      return {
        ...state,
        pendingApproval: action.payload,
      };
    case 'setStreaming':
      return {
        ...state,
        streaming: action.payload,
      };
    case 'setSelectedModel':
      return {
        ...state,
        selectedModelId: action.modelId,
      };
    default:
      return state;
  }
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(
    () => ({
      state,
      dispatch,
    }),
    [state],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider.');
  }

  return context;
}
