import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  type ExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { isAgentMessageEntry, isAgentUserMessage } from "@renderer/lib/is";
import { createTextDocument } from "@renderer/lib/rich-text";
import { EntryStatus, type SessionEntry } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { sideChatStore } from "@renderer/store/side-chat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { v4 as uuidv4 } from "uuid";

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
      getActiveSessionId() {
        return mainStore.getState().activeSessionId;
      },
      getArtifact<TContent = Record<string, unknown>>(sessionId: string, artifactId: string) {
        const artifact = mainStore
          .getState()
          .getArtifactState(sessionId)
          .artifacts.find((a) => a.id === artifactId);
        return artifact
          ? {
              content: artifact.content as TContent,
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
            }
          : null;
      },
      appendSideChatMeta(sideChatId, input) {
        const sideChat = sideChatStore.getState();
        if (!sideChat.getSideChatMeta(sideChatId)) {
          sideChat.appendSideChatMeta(sideChatId, {
            mainSessionId: input.mainSessionId,
            context: input.context ?? {},
            model: input.model,
            pendingPrompt: input.pendingPrompt,
            createdAt: Date.now(),
            inputDisabled: input.inputDisabled,
          });
        }
      },
      openArtifact(sessionId, artifactId) {
        mainStore.getState().setArtifactPanelOpen(sessionId, true);
        mainStore.getState().setActiveArtifactId(sessionId, artifactId);
      },
      upsertArtifact(sessionId, artifact) {
        mainStore.getState().upsertArtifact(sessionId, artifact);
      },
      insertSideChatUserMessageEntry(sideChatId, input, position) {
        const sideChat = sideChatStore.getState();
        const currentEntries = sideChat.getEntryState(sideChatId).entries;
        const insertIndex = clampEntryPosition(position, currentEntries.length);
        const existingEntry = currentEntries[insertIndex];

        if (
          existingEntry &&
          isAgentMessageEntry(existingEntry) &&
          isAgentUserMessage(existingEntry.data) &&
          existingEntry.data.content === input.text
        ) {
          return;
        }

        const entryId = uuidv4();
        const previousEntry = insertIndex > 0 ? currentEntries[insertIndex - 1] : undefined;
        const nextEntry = currentEntries[insertIndex];
        const parentId = previousEntry?.id ?? null;
        const timestamp = Date.now();
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: input.text,
          timestamp,
          kind: "prompt",
          jsonContent: createTextDocument(input.text),
        };
        const userEntry: SessionEntry = {
          id: entryId,
          sessionId: sideChatId,
          parentId,
          type: "message",
          timestamp,
          data: appUserMessage,
          status: EntryStatus.Local,
        };

        const entries = currentEntries.map((entry, index) => {
          if (index !== insertIndex || entry.id !== nextEntry?.id || entry.parentId !== parentId) {
            return entry;
          }
          return { ...entry, parentId: entryId };
        });

        sideChat.setSessionEntries(sideChatId, [
          ...entries.slice(0, insertIndex),
          userEntry,
          ...entries.slice(insertIndex),
        ]);
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

function clampEntryPosition(position: number, length: number) {
  if (!Number.isFinite(position)) return length;
  return Math.min(Math.max(Math.trunc(position), 0), length);
}
