import type { ReactNode } from 'react';
import { useSidebar } from './Sidebar';

interface SidebarHeaderProps {
  children?: ReactNode;
}

export function SidebarHeader({ children }: SidebarHeaderProps) {
  const { open, toggle } = useSidebar();

  return (
    <div className="flex items-center gap-1 border-b border-neutral-700 px-3 py-3">
      {open && children}
      <button
        onClick={toggle}
        className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <>
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <line x1="9" x2="9" y1="3" y2="21" />
            </>
          ) : (
            <>
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <line x1="9" x2="9" y1="3" y2="21" />
              <line x1="15" x2="15" y1="3" y2="21" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
