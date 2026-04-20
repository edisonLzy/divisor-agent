import type { HistoryMessage, MessageBlock } from '../types/domain';
import type { StreamChunk } from '../types/ipc';

interface MessageListProps {
  messages: HistoryMessage[];
  streamChunks: StreamChunk[];
}

function renderBlock(block: MessageBlock, index: number) {
  if (block.type === 'thinking') {
    return (
      <details className='message-thinking' key={`${block.type}-${index}`}>
        <summary>思考过程</summary>
        <pre>{block.content}</pre>
      </details>
    );
  }

  if (block.type === 'tool_result') {
    return (
      <div className='message-tool-result' key={`${block.type}-${index}`}>
        <p>工具：{block.toolName}</p>
        <pre>{block.content}</pre>
      </div>
    );
  }

  return <p key={`${block.type}-${index}`}>{block.content}</p>;
}

export function MessageList({ messages, streamChunks }: MessageListProps) {
  return (
    <div className='message-list'>
      {messages.length === 0 ? <p className='panel-placeholder'>请选择会话并开始对话。</p> : null}

      {messages.map((message) => (
        <article
          className={`message-card ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
          key={message.id}
        >
          <header>{message.role === 'user' ? '你' : 'Agent'}</header>
          <div>{message.blocks.map((block, index) => renderBlock(block, index))}</div>
        </article>
      ))}

      {streamChunks.length > 0 ? (
        <article className='message-card is-assistant'>
          <header>Agent（流式）</header>
          <div>
            {streamChunks.map((chunk) => {
              if (chunk.kind === 'thinking_delta') {
                return (
                  <details className='message-thinking' key={chunk.id} open>
                    <summary>思考过程</summary>
                    <pre>{chunk.content}</pre>
                  </details>
                );
              }

              return <p key={chunk.id}>{chunk.content}</p>;
            })}
          </div>
        </article>
      ) : null}
    </div>
  );
}
