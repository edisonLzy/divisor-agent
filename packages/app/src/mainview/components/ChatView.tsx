import type { HistoryMessage, MessageBlock } from '../types/message';

interface ChatViewProps {
  messages: HistoryMessage[];
  isStreaming: boolean;
}

function BlockView({ block }: { block: MessageBlock }) {
  if (block.type === 'thinking') {
    return (
      <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <summary className="cursor-pointer font-medium">思考过程</summary>
        <p className="mt-2 whitespace-pre-wrap">{block.content}</p>
      </details>
    );
  }

  if (block.type === 'tool_result') {
    return (
      <div className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase text-gray-500">{block.toolName}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap text-gray-800">{block.content}</pre>
      </div>
    );
  }

  return <p className="whitespace-pre-wrap leading-6">{block.content}</p>;
}

export function ChatView({ messages, isStreaming }: ChatViewProps) {
  return (
    <section className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Chat</h2>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-500">
            选择会话后开始对话。
          </p>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            className={[
              'max-w-[90%] rounded-xl px-4 py-3 shadow-sm',
              message.role === 'user'
                ? 'ml-auto bg-indigo-600 text-white'
                : 'bg-white text-gray-800',
            ].join(' ')}
          >
            <p className="mb-2 text-xs uppercase opacity-70">{message.role}</p>
            <div className="space-y-2">
              {message.blocks.map((block, index) => (
                <BlockView key={`${message.id}-${index}`} block={block} />
              ))}
            </div>
          </article>
        ))}
      </div>

      {isStreaming && (
        <div className="border-t border-gray-200 px-5 py-2 text-xs text-indigo-600">
          正在流式生成中…
        </div>
      )}
    </section>
  );
}
