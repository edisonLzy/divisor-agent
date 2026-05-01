import { Chat } from "./workspace/chat";
import { Sessions } from "./workspace/sessions";

export function App() {
  return (
    <div className="dark flex h-screen w-full overflow-hidden bg-[#111111] font-sans text-[#D4D4D4]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#141414] border-r border-[#2C2C2C] flex-col shrink-0 hidden">
        <Sessions />
      </aside>

      {/* Main Panel */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <Chat />
      </main>
    </div>
  );
}
