import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ElectroViewProvider } from './context/ElectroViewProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ElectroViewProvider>
      <App />
    </ElectroViewProvider>
  </StrictMode>,
);
