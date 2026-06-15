import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  type ExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import { mainStore } from "@renderer/store/main";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
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
  const extensionsContextAPI = useMemo<ExtensionsContextAPI>(
    () => ({
      openArtifact(sessionId, artifactId) {
        mainStore.getState().setArtifactPanelOpen(sessionId, true);
        mainStore.getState().setActiveArtifactId(sessionId, artifactId);
      },
      upsertArtifact(sessionId, artifact, options = {}) {
        const { activate = true, open = true } = options;

        mainStore.getState().upsertArtifact(sessionId, artifact, {
          activateOnCreate: activate,
          activateOnUpdate: activate,
          openOnCreate: open,
        });

        if (open) {
          mainStore.getState().setArtifactPanelOpen(sessionId, true);
        }
      },
    }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ElectronIPCProvider>
        <ExtensionProvider extensions={installedRendererExtensions}>
          <ExtensionsContextAPIProvider api={extensionsContextAPI}>
            <ThemeProvider defaultTheme="system" storageKey="divisor-agent.theme">
              <RouterProvider router={router} />
              <Toaster richColors closeButton />
            </ThemeProvider>
          </ExtensionsContextAPIProvider>
        </ExtensionProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}
