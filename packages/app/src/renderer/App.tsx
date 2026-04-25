import { TooltipProvider } from "./components/ui/tooltip";
import { Chat } from "./workspace/chat";
import { Sessions } from "./workspace/sessions";

export function App() {
  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-[#111111] text-[#D4D4D4] font-sans overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-[#141414] border-r border-[#2C2C2C] flex flex-col shrink-0">
          <Sessions />
        </aside>

        {/* Main Panel */}
        <main className="flex-1 flex flex-col relative min-w-0">
          <Chat />
        </main>
      </div>
    </TooltipProvider>
  );
}
