import { ExtensionProvider } from "@divisor-agent/extension-core/renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";

import { ThemeProvider } from "./components/theme-provider";
import { ElectronIPCProvider } from "./context/ElectronIPCProvider";
import { installedRendererExtensions } from "./extensions/installed-extensions";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ElectronIPCProvider>
        <ExtensionProvider extensions={installedRendererExtensions}>
          <ThemeProvider defaultTheme="system" storageKey="divisor-agent.theme">
            <RouterProvider router={router} />
            <Toaster richColors closeButton />
          </ThemeProvider>
        </ExtensionProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}
