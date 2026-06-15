import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  type ExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { mainStore } from "@renderer/store/main";
import { sideChatStore } from "@renderer/store/side-chat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
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
      appendSideChatArtifact(input) {
        mainStore.getState().upsertArtifact(input.parentSessionId, {
          id: input.id,
          type: "side-chat",
          content: {},
          name: input.title,
        });

        const sideChat = sideChatStore.getState();
        if (!sideChat.getSideChatMeta(input.id)) {
          sideChat.initSideChat(
            input.id,
            input.parentSessionId,
            input.context ?? {},
            input.model,
            input.pendingPrompt,
            {
              inputDisabled: input.inputDisabled,
              kind: input.kind,
            },
          );

          sideChat.appendMessageEntry(
            input.id,
            createAgentUserMessage(createTextDocument(input.pendingPrompt), input.pendingPrompt),
          );
        }
      },
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

function createTextDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}
