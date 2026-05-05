import { useReducer } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './lib/trpc';
import { AppContext } from './store/context';
import { appReducer, initialState } from './store/reducer';
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter } from './components/sidebar';
import SessionTree from './components/SessionTree';
import { NewSessionButton } from './workspaces/function-area/NewSessionButton';
import ChatView from './components/ChatView';
import InputBar from './components/InputBar';
import ApprovalDialog, { useApprovalListener } from './components/ApprovalDialog';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});

function AppInner() {
  useApprovalListener();

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar>
        <SidebarHeader>
          <span className="flex-1">Divisor Agent</span>
          <NewSessionButton />
        </SidebarHeader>
        <SidebarContent>
          <SessionTree />
        </SidebarContent>
        <SidebarFooter />
      </Sidebar>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <ChatView />
        </div>
        <InputBar />
      </main>

      <ApprovalDialog />
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider value={{ state, dispatch }}>
          <AppInner />
        </AppContext.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
