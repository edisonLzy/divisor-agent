import { RouterProvider } from "react-router-dom";

import { ThemeProvider } from "./components/theme-provider";
import { ElectronIPCProvider } from "./context/ElectronIPCProvider";
import { router } from "./router";

export function App() {
  return (
    <ElectronIPCProvider>
      <ThemeProvider defaultTheme="system" storageKey="divisor-agent.theme">
        <RouterProvider router={router} />
      </ThemeProvider>
    </ElectronIPCProvider>
  );
}
