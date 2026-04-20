import type { SessionNode } from '../types/session';

interface SessionTreeProps {
  nodes: SessionNode[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onRename: (node: SessionNode) => void;
  onDelete: (node: SessionNode) => void;
  onFork: (node: SessionNode) => void;
}

interface SessionNodeItemProps {
  node: SessionNode;
  depth: number;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onRename: (node: SessionNode) => void;
  onDelete: (node: SessionNode) => void;
  onFork: (node: SessionNode) => void;
}

function SessionNodeItem({
  node,
  depth,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  onFork,
}: SessionNodeItemProps) {
  const isActive = activeSessionId === node.id;

  return (
    <li>
      <div
        className={[
          'group flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm',
          isActive ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-100',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect(node.id)}
          title={node.name}
        >
          {node.name}
        </button>

        <div className="hidden items-center gap-1 group-hover:flex">
          <button
            type="button"
            className="rounded px-1 text-xs text-gray-500 hover:bg-gray-200"
            onClick={() => onFork(node)}
          >
            分支
          </button>
          <button
            type="button"
            className="rounded px-1 text-xs text-gray-500 hover:bg-gray-200"
            onClick={() => onRename(node)}
          >
            重命名
          </button>
          <button
            type="button"
            className="rounded px-1 text-xs text-red-500 hover:bg-red-50"
            onClick={() => onDelete(node)}
          >
            删除
          </button>
        </div>
      </div>

      {node.children && node.children.length > 0 && (
        <ul className="mt-1 space-y-1">
          {node.children.map((child) => (
            <SessionNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onFork={onFork}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SessionTree({
  nodes,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  onFork,
}: SessionTreeProps) {
  return (
    <aside className="w-80 min-w-80 border-r border-gray-200 bg-white p-3">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">会话树</h2>
      </header>

      {nodes.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-500">
          暂无会话，请先由主进程创建会话后刷新。
        </p>
      ) : (
        <ul className="space-y-1">
          {nodes.map((node) => (
            <SessionNodeItem
              key={node.id}
              node={node}
              depth={0}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onFork={onFork}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
