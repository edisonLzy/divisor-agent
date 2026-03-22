import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { trpc } from '../lib/trpc';
import { useAppState } from '../store/context';
import { renderBlock } from './MessageBlocks';
import type { HistoryMessage, MessageBlock } from '@divisor-agent/server';

interface AgentChunkPayload {
  type: 'text_delta' | 'thinking_delta';
  delta: string;
  chunkIndex: number;
  sessionId: string;
}

interface StreamingBubbleProps {
  text: string;
  thinking: string;
}

function StreamingBubble({ text, thinking }: StreamingBubbleProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  return (
    <div className="mb-4 flex flex-col gap-1">
      {thinking && (
        <div className="rounded border border-neutral-700 bg-neutral-800/50">
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-500 hover:text-neutral-300"
            onClick={() => setThinkingExpanded(v => !v)}
          >
            <span>{thinkingExpanded ? '▾' : '▸'}</span>
            <span>Thinking…</span>
          </button>
          {thinkingExpanded && (
            <div className="border-t border-neutral-700 px-3 py-2 text-xs text-neutral-400 whitespace-pre-wrap">
              {thinking}
            </div>
          )}
        </div>
      )}
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
        {text}
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: HistoryMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`} data-message-id={message.id}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-neutral-800 text-neutral-100'
        }`}
      >
        <div className="flex flex-col gap-1">
          {message.blocks.map((block: MessageBlock, i: number) => renderBlock(block, i))}
        </div>
      </div>
    </div>
  );
}

export default function ChatView() {
  const { state, dispatch } = useAppState();
  const { activeSessionId, messages, streaming } = state;
  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const sessionMessages = activeSessionId ? (messages.get(activeSessionId) ?? []) : [];

  // Load history when session changes
  const { data: historyData } = trpc.sessions.history.useQuery(
    { id: activeSessionId! },
    { enabled: !!activeSessionId },
  );

  useEffect(() => {
    if (historyData && activeSessionId) {
      dispatch({ type: 'SET_MESSAGES', sessionId: activeSessionId, messages: historyData.messages });
    }
  }, [historyData, activeSessionId, dispatch]);

  // Listen to streaming events from Rust
  useEffect(() => {
    const unlisten = listen<AgentChunkPayload>('agent_message_chunk', (event) => {
      const { type, delta, chunkIndex } = event.payload;
      dispatch({ type: 'STREAMING_CHUNK', chunk: { type, delta, chunkIndex } });
    });

    const unlistenDone = listen<{ sessionId: string }>('agent_message_done', (event) => {
      const { sessionId } = event.payload;
      dispatch({ type: 'STREAMING_DONE', sessionId });
      // Reload history now that server has persisted both messages
      utils.sessions.history.invalidate({ id: sessionId });
      utils.sessions.list.invalidate();
    });

    return () => {
      unlisten.then(fn => fn());
      unlistenDone.then(fn => fn());
    };
  }, [activeSessionId, dispatch]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages.length, streaming?.textContent]);

  if (!activeSessionId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Select or start a session to begin
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      {sessionMessages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {streaming && streaming.sessionId === activeSessionId && (
        <div className="mb-4 flex justify-start">
          <div className="max-w-[80%] rounded-lg bg-neutral-800 px-4 py-3">
            <StreamingBubble text={streaming.textContent} thinking={streaming.thinkingContent} />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
