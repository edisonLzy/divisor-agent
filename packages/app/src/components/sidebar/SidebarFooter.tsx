import type { ReactNode } from 'react';

interface SidebarFooterProps {
  children?: ReactNode;
}

export function SidebarFooter({ children }: SidebarFooterProps) {
  if (!children) return null;

  return (
    <div className="border-t border-neutral-700 px-3 py-2">
      {children}
    </div>
  );
}
