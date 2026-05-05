import { useEffect, type ReactNode } from 'react';
import { useSystemStore } from '../../store/system';

export function useSidebar() {
  const sidebarOpen = useSystemStore(s => s.sidebarOpen);
  const toggleSidebar = useSystemStore(s => s.toggleSidebar);
  return { open: sidebarOpen, toggle: toggleSidebar };
}

interface SidebarProps {
  children: ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  const { open, toggle } = useSidebar();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-neutral-700 bg-neutral-900 transition-all duration-200 ${
        open ? 'w-64' : 'w-14'
      }`}
    >
      {children}
    </aside>
  );
}
