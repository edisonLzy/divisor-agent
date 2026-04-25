import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { App } from "./App";
import { ElectronIPCProvider } from "./context/ElectronIPCProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ElectronIPCProvider>
      <App />
    </ElectronIPCProvider>
  </StrictMode>,
);
