import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppState } from '../store/context';

interface PermissionRequest {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}

const OPERATION_LABELS: Record<string, string> = {
  fs_write: '📝 File Write',
  terminal_exec: '⚡ Terminal Command',
  cross_dir_access: '📁 Cross-Directory Access',
};

export function useApprovalListener() {
  const { dispatch } = useAppState();

  useEffect(() => {
    const unlisten = listen<PermissionRequest>('session_request_permission', (event) => {
      dispatch({ type: 'SET_PENDING_APPROVAL', request: event.payload });
    });

    const unlistenForked = listen<{ newSessionId: string }>('session_forked', (event) => {
      dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: event.payload.newSessionId });
    });

    return () => {
      unlisten.then(fn => fn());
      unlistenForked.then(fn => fn());
    };
  }, [dispatch]);
}

export default function ApprovalDialog() {
  const { state, dispatch } = useAppState();
  const { pendingApproval } = state;

  if (!pendingApproval) return null;

  const { requestId, operation, params } = pendingApproval;
  const operationLabel = OPERATION_LABELS[operation] ?? operation;

  async function handleApprove() {
    try {
      await invoke('permission_approve', { requestId });
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      dispatch({ type: 'CLEAR_PENDING_APPROVAL' });
    }
  }

  async function handleReject() {
    try {
      await invoke('permission_reject', { requestId });
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      dispatch({ type: 'CLEAR_PENDING_APPROVAL' });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20 text-yellow-400">
            ⚠
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Permission Required</h2>
            <p className="text-sm text-neutral-400">{operationLabel}</p>
          </div>
        </div>

        <div className="mb-6 rounded-md border border-neutral-700 bg-neutral-800 p-4">
          <pre className="overflow-x-auto text-xs text-neutral-300">
            {JSON.stringify(params, null, 2)}
          </pre>
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 rounded-lg bg-neutral-700 py-2 text-sm font-medium text-white hover:bg-neutral-600"
            onClick={handleReject}
          >
            Reject
          </button>
          <button
            className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-500"
            onClick={handleApprove}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
