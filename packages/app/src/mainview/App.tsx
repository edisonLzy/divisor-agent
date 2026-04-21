import { Workspace } from './modules/workspace/Workspace';

import { TooltipProvider } from './components/ui/tooltip';

function App() {
  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-[#111111] text-[#D4D4D4] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#141414] border-r border-[#2C2C2C] flex flex-col flex-shrink-0">
        {/* Sidebar Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#2C2C2C]">
          <span className="font-semibold text-sm text-[#EFEFEF]">Sessions</span>
          <div className="flex gap-2 text-[#9E9E9E]">
            <button className="hover:text-[#D4D4D4]" title="Search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
            <button className="hover:text-[#D4D4D4]" title="New Session">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto py-2 px-2 flex flex-col gap-4">
          <div>
            <div className="text-[11px] font-bold text-[#666666] uppercase tracking-wider px-2 mb-1">Pinned</div>
            <div className="flex flex-col gap-0.5">
              <div className="px-2 py-1.5 bg-[#222222] rounded-md cursor-pointer flex items-center gap-2">
                <div className="w-2 h-2 rounded-full border border-[#666666]"></div>
                <div className="flex-1 truncate text-[13px] text-[#EFEFEF]">评估项目中的扩展机制实现方案</div>
              </div>
            </div>
          </div>
        </div>

        {/* Customizations Menu */}
        <div className="p-2 border-t border-[#2C2C2C] flex flex-col gap-0.5">
          <div className="text-[11px] font-bold text-[#666666] uppercase tracking-wider px-2 py-1">Customizations</div>
          {['Agents', 'Skills', 'Instructions'].map((item) => (
            <div key={item} className="flex justify-between items-center px-2 py-1.5 hover:bg-[#222222] rounded-md cursor-pointer text-[#9E9E9E] hover:text-[#D4D4D4] text-[13px]">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                <span>{item}</span>
              </div>
              <span className="text-[11px] bg-[#222222] px-1.5 rounded text-[#666666]">3</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Top Navbar */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-[#2C2C2C] flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#9E9E9E]">评估项目中的扩展机制实现方案</span>
            <span className="text-[#666666]">divisor-agent</span>
          </div>
          <div className="flex items-center gap-3 text-[#9E9E9E]">
            <button className="hover:text-[#D4D4D4]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            </button>
          </div>
        </header>

        {/* Workspace */}
        <Workspace />
      </main>
    </div>
    </TooltipProvider>
  );
}

export default App;
