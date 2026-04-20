import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useAppState } from '../store/context';
import type { SessionNode } from '../types/index';

interface SessionNodeItemProps {
  node: SessionNode;
  depth: number;
}

function SessionNodeItem({ node, depth }: SessionNodeItemProps) {
  const { state, dispatch } = useAppState();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);

  const utils = trpc.useUtils();
  const rename = trpc.sessions.rename.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });
  const del = trpc.sessions.delete.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });

  const isActive = state.activeSessionId === node.id;

  function handleSelect() {
    dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: node.id });
  }

  function handleRenameSubmit() {
    if (editName.trim() && editName !== node.name) {
      rename.mutate({ id: node.id, name: editName.trim() });
    }
    setEditing(false);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    del.mutate({ id: node.id });
  }

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm hover:bg-neutral-700 ${isActive ? 'bg-neutral-700 text-white' : 'text-neutral-300'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={handleSelect}
      >
        {hasChildren && (
          <button
            className="shrink-0 text-neutral-500 hover:text-neutral-300"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
        {!hasChildren && <span className="w-3 shrink-0" />}

        {editing ? (
          <input
            autoFocus
            className="flex-1 rounded bg-neutral-600 px-1 text-sm text-white outline-none"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setEditing(false); }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 truncate"
            onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
          >
            {node.name}
          </span>
        )}

        <button
          className="hidden shrink-0 text-xs text-neutral-500 hover:text-red-400 group-hover:block"
          title="Delete session"
          onClick={handleDelete}
        >
          ✕
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child: SessionNode) => (
            <SessionNodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionTree() {
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery(undefined, {
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-neutral-500">Loading sessions…</div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-500">No sessions yet. Start a conversation.</div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto py-2">
      <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Sessions
      </div>
      {sessions.map(node => (
        <SessionNodeItem key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}
