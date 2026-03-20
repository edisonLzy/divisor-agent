import React, { useState } from 'react';
import type { MessageBlock } from '@divisor-agent/server';

// ── Block renderers ──────────────────────────────────────────────────────────

function TextBlockRenderer({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
      {content}
    </div>
  );
}

function ThinkingBlockRenderer({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1 rounded border border-neutral-700 bg-neutral-800/50">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-500 hover:text-neutral-300"
        onClick={() => setExpanded(v => !v)}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>Thinking…</span>
      </button>
      {expanded && (
        <div className="border-t border-neutral-700 px-3 py-2 text-xs text-neutral-400 whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

const ToolResultBlockRenderer = React.memo(function ToolResultBlockRenderer({
  toolName,
  content,
}: {
  toolName: string;
  content: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1 rounded border border-neutral-700 bg-neutral-900/50">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:text-neutral-300"
        onClick={() => setExpanded(v => !v)}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span className="font-mono text-blue-400">{toolName}</span>
        <span className="text-neutral-500">result</span>
      </button>
      {expanded && (
        <pre className="border-t border-neutral-700 px-3 py-2 text-xs text-neutral-400 overflow-x-auto">
          {content}
        </pre>
      )}
    </div>
  );
});

// ── Block registry (factory pattern) ───────────────────────────────────────

type BlockRenderer = React.ComponentType<{ block: MessageBlock }>;

const BLOCK_RENDERERS: Record<MessageBlock['type'], BlockRenderer> = {
  text: ({ block }) => block.type === 'text' ? <TextBlockRenderer content={block.content} /> : null,
  thinking: ({ block }) => block.type === 'thinking' ? <ThinkingBlockRenderer content={block.content} /> : null,
  tool_result: ({ block }) =>
    block.type === 'tool_result' ? (
      <ToolResultBlockRenderer toolName={block.toolName} content={block.content} />
    ) : null,
};

export function renderBlock(block: MessageBlock, key: string | number) {
  const Renderer = BLOCK_RENDERERS[block.type];
  if (!Renderer) return null;
  return <Renderer key={key} block={block} />;
}
