import { Outlet, Navigate } from "react-router-dom";

import { WorkspaceSessionProvider } from "./workspace/session-provider";
import { Sessions } from "./workspace/sessions";

export function AppLayout() {
  return (
    <WorkspaceSessionProvider>
      <Outlet />
    </WorkspaceSessionProvider>
  );
}

export function WorkspaceLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-sans text-foreground">
      <aside className="flex shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <Sessions />
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

export function NotFoundRedirect() {
  return <Navigate to="/" replace />;
}
