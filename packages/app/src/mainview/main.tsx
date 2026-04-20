import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { TrpcProvider } from './lib/trpc';
import { AppStateProvider } from './store/app-state';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrpcProvider>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </TrpcProvider>
  </StrictMode>,
);
