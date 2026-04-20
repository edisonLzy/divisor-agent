import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { trpc, createTrpcClient } from './lib/trpc';
import { AppStateProvider } from './store/app-state';

const queryClient = new QueryClient();
const trpcClient = createTrpcClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
