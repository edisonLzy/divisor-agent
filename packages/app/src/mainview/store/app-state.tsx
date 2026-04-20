import { createContext, useContext, useMemo, useReducer, type ReactNode, type Dispatch } from 'react';
import type { PermissionRequest } from '../types/session';

interface AppState {
  activeSessionId: string | null;
  pendingApproval: PermissionRequest | null;
  streaming: {
    sessionId: string | null;
    isStreaming: boolean;
  };
}

type AppAction =
  | { type: 'set_active_session'; sessionId: string | null }
  | { type: 'set_pending_approval'; approval: PermissionRequest | null }
  | { type: 'set_streaming'; sessionId: string | null; isStreaming: boolean };

const initialState: AppState = {
  activeSessionId: null,
  pendingApproval: null,
  streaming: {
    sessionId: null,
    isStreaming: false,
  },
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set_active_session':
      return {
        ...state,
        activeSessionId: action.sessionId,
      };
    case 'set_pending_approval':
      return {
        ...state,
        pendingApproval: action.approval,
      };
    case 'set_streaming':
      return {
        ...state,
        streaming: {
          sessionId: action.sessionId,
          isStreaming: action.isStreaming,
        },
      };
    default:
      return state;
  }
}

const AppStateContext = createContext<AppState | undefined>(undefined);
const AppDispatchContext = createContext<Dispatch<AppAction> | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const value = useMemo(() => state, [state]);

  return (
    <AppStateContext.Provider value={value}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }

  return context;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const context = useContext(AppDispatchContext);
  if (!context) {
    throw new Error('useAppDispatch must be used within AppStateProvider');
  }

  return context;
}
