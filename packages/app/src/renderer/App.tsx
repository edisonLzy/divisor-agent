import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  type ExtensionsContextAPI,
} from "@divisor-agent/extension-core/renderer";
import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { Alert, AlertDescription, AlertTitle } from "@renderer/components/ui/alert";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Progress, ProgressLabel, ProgressValue } from "@renderer/components/ui/progress";
import { isAgentMessageEntry, isAgentUserMessage } from "@renderer/lib/is";
import { createTextDocument } from "@renderer/lib/rich-text";
import { EntryStatus, type SessionEntry } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { sideChatStore } from "@renderer/store/side-chat";
import type { UpdateState } from "@shared/update-ipc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CircleAlertIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { v4 as uuidv4 } from "uuid";

import { ThemeProvider } from "./components/theme-provider";
import { ElectronIPCProvider, useElectronIPC } from "./context/ElectronIPCProvider";
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
            model: input.model
              ? {
                  ...input.model,
                  modelName: input.model.modelId,
                  providerName: input.model.providerId,
                }
              : undefined,
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
              <UpdateDialog />
              <Toaster richColors closeButton />
            </ThemeProvider>
          </ExtensionsContextAPIProvider>
        </ExtensionProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}

function UpdateDialog() {
  const { invoke, on } = useElectronIPC();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UpdateState>({
    status: "idle",
    currentVersion: "",
  });

  useEffect(() => {
    const applyState = (nextState: UpdateState) => {
      setState(nextState);
      if (nextState.status === "available") setOpen(true);
    };
    const unsubscribe = on("update_state", applyState);
    void invoke("getUpdateState").then(applyState);
    return unsubscribe;
  }, [invoke, on]);

  const isInstalling = state.status === "downloading" || state.status === "downloaded";

  function handleOpenChange(nextOpen: boolean) {
    if (!isInstalling) setOpen(nextOpen);
  }

  async function startUpdate() {
    try {
      await invoke("startUpdate");
    } catch (error) {
      setState({
        status: "error",
        currentVersion: state.currentVersion,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function retryUpdate() {
    try {
      await invoke("checkForUpdates");
    } catch (error) {
      setState({
        status: "error",
        currentVersion: state.currentVersion,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isInstalling}>
        <DialogHeader>
          <DialogTitle>{getUpdateTitle(state)}</DialogTitle>
          <DialogDescription>{getUpdateDescription(state)}</DialogDescription>
        </DialogHeader>

        {state.status === "downloading" && (
          <Progress value={state.percent}>
            <ProgressLabel>下载进度</ProgressLabel>
            <ProgressValue />
          </Progress>
        )}

        {state.status === "error" && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>无法完成更新</AlertTitle>
            <AlertDescription className="break-words">{state.message}</AlertDescription>
          </Alert>
        )}

        {state.status === "available" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              稍后提醒
            </Button>
            <Button onClick={() => void startUpdate()}>
              <DownloadIcon data-icon="inline-start" />
              下载并安装
            </Button>
          </DialogFooter>
        )}

        {state.status === "error" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
            <Button onClick={() => void retryUpdate()}>
              <RefreshCwIcon data-icon="inline-start" />
              重试
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getUpdateTitle(state: UpdateState) {
  switch (state.status) {
    case "available":
      return "发现新版本";
    case "downloading":
      return "正在下载更新";
    case "downloaded":
      return "即将重启应用";
    case "error":
      return "更新失败";
    default:
      return "应用更新";
  }
}

function getUpdateDescription(state: UpdateState) {
  switch (state.status) {
    case "available":
      return `Divisor Agent ${state.version} 已发布，当前版本为 ${state.currentVersion}。`;
    case "downloading":
      return `正在下载 Divisor Agent ${state.version}，完成后将自动安装并重启。`;
    case "downloaded":
      return `Divisor Agent ${state.version} 已下载完成，正在安装更新。`;
    case "error":
      return "下载或安装更新时发生错误，请检查网络后重试。";
    default:
      return "";
  }
}

function clampEntryPosition(position: number, length: number) {
  if (!Number.isFinite(position)) return length;
  return Math.min(Math.max(Math.trunc(position), 0), length);
}
