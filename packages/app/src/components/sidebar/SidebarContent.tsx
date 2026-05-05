import type { ReactNode } from 'react';

interface SidebarContentProps {
  children: ReactNode;
}

export function SidebarContent({ children }: SidebarContentProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {children}
    </div>
  );
}
