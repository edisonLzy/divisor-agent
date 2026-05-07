import { ThemeProvider } from "./components/theme-provider";
import { Chat } from "./workspace/chat";
import { Sessions } from "./workspace/sessions";

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="divisor-agent.theme">
      <div className="flex h-screen w-full overflow-hidden bg-background font-sans text-foreground">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <Sessions />
        </aside>

        {/* Main Panel */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <Chat />
        </main>
      </div>
    </ThemeProvider>
  );
}
