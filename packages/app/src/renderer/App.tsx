import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";

import { ThemeProvider } from "./components/theme-provider";
import { ElectronIPCProvider } from "./context/ElectronIPCProvider";
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
        <ThemeProvider defaultTheme="system" storageKey="divisor-agent.theme">
          <RouterProvider router={router} />
          <Toaster richColors closeButton />
        </ThemeProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}
