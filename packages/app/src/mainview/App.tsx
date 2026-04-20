import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageList } from './components/MessageList';
import { SessionTree } from './components/SessionTree';
import { InputBar } from './components/InputBar';
import { ApprovalDialog } from './components/ApprovalDialog';
import { permissionApprove, permissionReject, sessionPrompt, subscribeAgentEvents } from './lib/ipc';
import { trpc } from './lib/trpc';
import { useAppState } from './store/app-state';
import type { HistoryMessage, SessionNode } from './types/domain';
import type { StreamChunk } from './types/ipc';

function flattenSessionTree(nodes: SessionNode[]): SessionNode[] {
  const result: SessionNode[] = [];

  const visit = (currentNodes: SessionNode[]) => {
    currentNodes.forEach((node) => {
      result.push(node);

      if (node.children?.length) {
        visit(node.children);
      }
    });
  };

  visit(nodes);

  return result;
}

function getLatestSessionId(sessions: SessionNode[]): string | null {
  const flattened = flattenSessionTree(sessions);
  const sorted = [...flattened].sort((a, b) => b.timestamp - a.timestamp);

  return sorted[0]?.id ?? null;
}

export default function App() {
  const { state, dispatch } = useAppState();
  const trpcUtils = trpc.useUtils();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamChunks, setStreamChunks] = useState<Record<string, StreamChunk[]>>({});

  const sessionsQuery = trpc.sessions.list.useQuery();
  const modelsQuery = trpc.models.list.useQuery();
  const historyQuery = trpc.sessions.history.useQuery(
    { id: state.activeSessionId ?? '' },
    { enabled: Boolean(state.activeSessionId) },
  );

  useEffect(() => {
    if (!sessionsQuery.data?.length || state.activeSessionId) {
      return;
    }

    const latestSessionId = getLatestSessionId(sessionsQuery.data);

    dispatch({ type: 'setActiveSession', sessionId: latestSessionId });
  }, [dispatch, sessionsQuery.data, state.activeSessionId]);

  const sessions = sessionsQuery.data ?? [];
  const historyMessages = useMemo<HistoryMessage[]>(() => {
    return historyQuery.data?.messages ?? [];
  }, [historyQuery.data]);

  const streamCounterRef = useRef(0);

  useEffect(() => {
    return subscribeAgentEvents((event) => {
      if (event.type === 'sessionRequestPermission') {
        dispatch({
          type: 'setPendingApproval',
          payload: {
            requestId: event.requestId,
            operation: event.operation,
            params: event.params,
          },
        });
        return;
      }

      if (event.type === 'sessionForked') {
        void trpcUtils.sessions.list.invalidate();
        dispatch({ type: 'setActiveSession', sessionId: event.newSessionId });
        return;
      }

      if (event.type === 'agentMessageDone') {
        dispatch({
          type: 'setStreaming',
          payload: {
            sessionId: event.sessionId,
            isStreaming: false,
          },
        });
        void trpcUtils.sessions.history.invalidate({ id: event.sessionId });
        return;
      }

      setStreamChunks((previous) => {
        const currentSessionChunks = previous[event.sessionId] ?? [];
        const nextChunk: StreamChunk = {
          id: `${event.sessionId}-${streamCounterRef.current++}`,
          kind: event.deltaType,
          content: event.delta,
        };

        return {
          ...previous,
          [event.sessionId]: [...currentSessionChunks, nextChunk],
        };
      });

      dispatch({
        type: 'setStreaming',
        payload: {
          sessionId: event.sessionId,
          isStreaming: true,
        },
      });
    });
  }, [dispatch, trpcUtils.sessions.history, trpcUtils.sessions.list]);

  const activeStreamChunks = state.activeSessionId ? (streamChunks[state.activeSessionId] ?? []) : [];

  const handleSend = async (content: string): Promise<void> => {
    setErrorMessage(null);

    if (!state.activeSessionId) {
      setErrorMessage('请先选择会话。');
      return;
    }

    try {
      await sessionPrompt({
        sessionId: state.activeSessionId,
        content,
      });

      dispatch({
        type: 'setStreaming',
        payload: {
          sessionId: state.activeSessionId,
          isStreaming: true,
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '发送失败，请稍后重试。');
    }
  };

  const handleApprove = async (requestId: string): Promise<void> => {
    await permissionApprove({ requestId });
    dispatch({ type: 'setPendingApproval', payload: null });
  };

  const handleReject = async (requestId: string): Promise<void> => {
    await permissionReject({ requestId });
    dispatch({ type: 'setPendingApproval', payload: null });
  };

  return (
    <div className='app-shell'>
      <SessionTree
        sessions={sessions}
        activeSessionId={state.activeSessionId}
        onSelect={(sessionId) => {
          dispatch({ type: 'setActiveSession', sessionId });
          setStreamChunks((previous) => ({
            ...previous,
            [sessionId]: previous[sessionId] ?? [],
          }));
        }}
        isLoading={sessionsQuery.isLoading}
        onRefresh={() => {
          void sessionsQuery.refetch();
        }}
      />
      <main className='chat-panel'>
        <header className='chat-header'>
          <h1>divisor-agent MVP</h1>
          <select
            value={state.selectedModelId ?? ''}
            onChange={(event) => {
              const nextModelId = event.target.value || null;
              dispatch({ type: 'setSelectedModel', modelId: nextModelId });
            }}
          >
            <option value=''>默认模型</option>
            {(modelsQuery.data ?? []).map((model) => (
              <option key={`${model.providerId}:${model.modelId}`} value={model.modelId}>
                {model.modelName} ({model.providerId})
              </option>
            ))}
          </select>
        </header>

        {errorMessage ? <p className='error-banner'>{errorMessage}</p> : null}

        <MessageList messages={historyMessages} streamChunks={activeStreamChunks} />

        <div className='chat-footer'>
          <span>
            {state.streaming.isStreaming && state.streaming.sessionId === state.activeSessionId
              ? 'Agent 正在响应...'
              : '就绪'}
          </span>
        </div>

        <InputBar
          onSend={handleSend}
          disabled={!state.activeSessionId || sessionsQuery.isLoading || historyQuery.isFetching}
        />
      </main>

      <ApprovalDialog
        pendingApproval={state.pendingApproval}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
