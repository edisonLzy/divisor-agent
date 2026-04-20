import type { SessionNode } from '../types/domain';

interface SessionTreeProps {
  sessions: SessionNode[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

interface SessionTreeNodeProps {
  node: SessionNode;
  activeSessionId: string | null;
  depth: number;
  onSelect: (sessionId: string) => void;
}

function SessionTreeNode({ node, activeSessionId, depth, onSelect }: SessionTreeNodeProps) {
  const isActive = node.id === activeSessionId;

  return (
    <li>
      <button
        type='button'
        className={`session-tree-node ${isActive ? 'is-active' : ''}`}
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        <span className='node-name'>{node.name}</span>
      </button>
      {node.children && node.children.length > 0 ? (
        <ul className='session-tree-list'>
          {node.children.map((child) => (
            <SessionTreeNode
              key={child.id}
              node={child}
              activeSessionId={activeSessionId}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SessionTree({
  sessions,
  activeSessionId,
  onSelect,
  isLoading,
  onRefresh,
}: SessionTreeProps) {
  return (
    <aside className='session-tree-panel'>
      <div className='panel-header'>
        <h2>会话树</h2>
        <button type='button' onClick={onRefresh}>刷新</button>
      </div>

      {isLoading ? <p className='panel-placeholder'>正在加载会话...</p> : null}
      {!isLoading && sessions.length === 0 ? <p className='panel-placeholder'>暂无会话。</p> : null}

      <ul className='session-tree-list'>
        {sessions.map((session) => (
          <SessionTreeNode
            key={session.id}
            node={session}
            activeSessionId={activeSessionId}
            depth={0}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </aside>
  );
}
