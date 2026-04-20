import { useEffect, useMemo, useState } from 'react';
import { SessionTree } from './components/SessionTree';
import { ChatView } from './components/ChatView';
import { InputBar } from './components/InputBar';
import { ApprovalDialog } from './components/ApprovalDialog';
import { trpc } from './lib/trpc';
import { permissionApprove, permissionReject, sessionPrompt, subscribeRuntimeEvent } from './lib/runtime';
import { useAppDispatch, useAppState } from './store/app-state';
import type { HistoryMessage } from './types/message';
import type { SessionNode } from './types/session';

function flattenSessionTree(nodes: SessionNode[]): SessionNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenSessionTree(node.children) : [])]);
}

interface StreamingChunk {
  sessionId: string;
  type: 'text' | 'thinking';
  delta: string;
}

function accumulateStreamingChunk(
  previousMessages: HistoryMessage[],
  chunk: StreamingChunk,
): HistoryMessage[] {
  const streamMessageId = `local-stream-${chunk.sessionId}`;
  const existingIndex = previousMessages.findIndex((msg) => msg.id === streamMessageId);
  const next = [...previousMessages];

  if (existingIndex === -1) {
    next.push({
      id: streamMessageId,
      sessionId: chunk.sessionId,
      role: 'assistant',
      blocks: [{ type: chunk.type, content: chunk.delta }],
      timestamp: Date.now(),
    });

    return next;
  }

  const message = next[existingIndex];
  const targetIndex = message.blocks.findIndex((block) => block.type === chunk.type);
  if (targetIndex === -1) {
    message.blocks.push({ type: chunk.type, content: chunk.delta });
  } else {
    message.blocks[targetIndex] = {
      ...message.blocks[targetIndex],
      content: message.blocks[targetIndex].content + chunk.delta,
    };
  }

  return next;
}

function createUserMessage(sessionId: string, content: string): HistoryMessage {
  return {
    id: `local-user-${crypto.randomUUID()}`,
    sessionId,
    role: 'user',
    blocks: [{ type: 'text', content }],
    timestamp: Date.now(),
  };
}

export default function App() {
  const appState = useAppState();
  const dispatch = useAppDispatch();
  const trpcUtils = trpc.useUtils();
  const [localMessagesBySession, setLocalMessagesBySession] = useState<Record<string, HistoryMessage[]>>({});

  const sessionsQuery = trpc.sessions.list.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const modelsQuery = trpc.models.list.useQuery();
  const renameMutation = trpc.sessions.rename.useMutation();
  const deleteMutation = trpc.sessions.delete.useMutation();
  const forkMutation = trpc.sessions.fork.useMutation();
  const historyQuery = trpc.sessions.history.useQuery(
    { id: appState.activeSessionId ?? '' },
    { enabled: Boolean(appState.activeSessionId) },
  );

  const selectedModel = modelsQuery.data?.[0];

  useEffect(() => {
    if (appState.activeSessionId || !sessionsQuery.data || sessionsQuery.data.length === 0) {
      return;
    }

    const firstNode = flattenSessionTree(sessionsQuery.data)[0];
    if (firstNode) {
      dispatch({ type: 'set_active_session', sessionId: firstNode.id });
    }
  }, [appState.activeSessionId, dispatch, sessionsQuery.data]);

  useEffect(() => {
    const unsubscribeChunk = subscribeRuntimeEvent('agentMessageChunk', (payload) => {
      setLocalMessagesBySession((prev) => {
        return {
          ...prev,
          [payload.sessionId]: accumulateStreamingChunk(prev[payload.sessionId] ?? [], payload),
        };
      });

      dispatch({ type: 'set_streaming', sessionId: payload.sessionId, isStreaming: true });
    });
    const unsubscribeDone = subscribeRuntimeEvent('agentMessageDone', async (payload) => {
      dispatch({ type: 'set_streaming', sessionId: payload.sessionId, isStreaming: false });
      await trpcUtils.sessions.history.invalidate({ id: payload.sessionId });
    });
    const unsubscribeApproval = subscribeRuntimeEvent('sessionRequestPermission', (payload) => {
      dispatch({ type: 'set_pending_approval', approval: payload });
    });

    return () => {
      unsubscribeChunk();
      unsubscribeDone();
      unsubscribeApproval();
    };
  }, [dispatch, trpcUtils.sessions.history]);

  const visibleMessages = useMemo(() => {
    const remoteMessages = historyQuery.data?.messages ?? [];
    const localMessages = appState.activeSessionId
      ? (localMessagesBySession[appState.activeSessionId] ?? [])
      : [];

    return [...remoteMessages, ...localMessages].sort((a, b) => a.timestamp - b.timestamp);
  }, [appState.activeSessionId, historyQuery.data?.messages, localMessagesBySession]);

  const handleRename = async (node: SessionNode) => {
    const name = window.prompt('请输入新的会话名称', node.name)?.trim();
    if (!name || name === node.name) {
      return;
    }

    await renameMutation.mutateAsync({ id: node.id, name });
    await trpcUtils.sessions.list.invalidate();
  };

  const handleDelete = async (node: SessionNode) => {
    const confirmed = window.confirm(`确认删除会话「${node.name}」吗？`);
    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync({ id: node.id });
    await trpcUtils.sessions.list.invalidate();
    if (appState.activeSessionId === node.id) {
      dispatch({ type: 'set_active_session', sessionId: null });
    }
  };

  const handleFork = async (node: SessionNode) => {
    const result = await forkMutation.mutateAsync({ id: node.id });
    await trpcUtils.sessions.list.invalidate();
    dispatch({ type: 'set_active_session', sessionId: result.newSessionId });
  };

  const handleSend = async (content: string) => {
    const activeSessionId = appState.activeSessionId;
    if (!activeSessionId) {
      return;
    }

    setLocalMessagesBySession((prev) => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] ?? []), createUserMessage(activeSessionId, content)],
    }));

    await sessionPrompt({
      sessionId: activeSessionId,
      content,
      model: selectedModel
        ? {
          providerId: selectedModel.providerId,
          modelId: selectedModel.modelId,
        }
        : undefined,
    });
  };

  const handleApprove = async (requestId: string) => {
    await permissionApprove(requestId);
    dispatch({ type: 'set_pending_approval', approval: null });
  };

  const handleReject = async (requestId: string) => {
    await permissionReject(requestId);
    dispatch({ type: 'set_pending_approval', approval: null });
  };

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900">
      <SessionTree
        nodes={sessionsQuery.data ?? []}
        activeSessionId={appState.activeSessionId}
        onSelect={(sessionId) => dispatch({ type: 'set_active_session', sessionId })}
        onRename={(node) => void handleRename(node)}
        onDelete={(node) => void handleDelete(node)}
        onFork={(node) => void handleFork(node)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <ChatView
          messages={visibleMessages}
          isStreaming={appState.streaming.sessionId === appState.activeSessionId && appState.streaming.isStreaming}
        />
        <InputBar
          disabled={!appState.activeSessionId}
          onSend={(content) => handleSend(content)}
        />
      </main>

      <ApprovalDialog
        approval={appState.pendingApproval}
        onApprove={(requestId) => handleApprove(requestId)}
        onReject={(requestId) => handleReject(requestId)}
      />
    </div>
  );
}
