import { createSession, listWorkspaces, type Workspace } from "@renderer/apis/sessions";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@renderer/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@renderer/components/ui/popover";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { sessionStore } from "@renderer/store/sessions";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Folder, FolderPlus, FolderX, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";

import { useInvalidateStandaloneSessions } from "../sessions/use-standalone-sessions";
import { useInvalidateWorkspaceSessions } from "../sessions/use-workspaces";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";

export function PendingSessionContent() {
  const { invoke } = useElectronIPC();
  const pendingWorkspaceId = useStore(
    sessionStore,
    (state) => state.pendingSession?.workspaceId ?? null,
  );
  const invalidateStandalone = useInvalidateStandaloneSessions();
  const invalidateWorkspaceSessions = useInvalidateWorkspaceSessions();
  const [isLoading, setIsLoading] = useState(false);

  const submitPrompt = async (submission: PromptSubmission) => {
    setIsLoading(true);

    try {
      const store = sessionStore.getState();
      const pending = store.pendingSession;
      if (!pending) {
        return;
      }

      const newSession = await createSession({
        name: "新对话",
        workspaceId: pending.workspaceId,
        parentSessionId: null,
      });

      store.addSessions([newSession]);
      store.setActiveSessionId(newSession.id);
      store.clearPendingSession();

      await invoke("setSessionId", newSession.id);

      if (pending.workspaceId) {
        await invalidateWorkspaceSessions(pending.workspaceId);
      } else {
        await invalidateStandalone();
      }

      sessionStore.getState().setSessionStatus(newSession.id, "running");

      await invoke("prompt", newSession.id, submission.text, {
        modelId: submission.model.modelId,
        providerId: submission.model.providerId,
      });
    } catch (error) {
      console.error("Failed to submit prompt", error);

      const sessionId = sessionStore.getState().activeSessionId;
      if (sessionId) {
        sessionStore.getState().setSessionStatus(sessionId, "idle");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="min-h-0 flex-1 px-6 pt-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center gap-8 pb-16">
        <h1 className="text-center text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          我们应该在 divisor-agent 中构建什么？
        </h1>

        <div className="w-full max-w-3xl">
          <PromptInput disabled={isLoading} onSubmit={submitPrompt} sessionId={null} />
          <SessionProfile />
        </div>
      </div>
    </section>
  );
}

function SessionProfile() {
  return (
    <div className="mt-2.5 flex items-center gap-2 pl-2">
      <WorkspaceSelector />
    </div>
  );
}

function WorkspaceSelector() {
  const pendingWorkspaceId = useStore(
    sessionStore,
    (state) => state.pendingSession?.workspaceId ?? null,
  );

  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["workspaces", "pending-selector"],
    queryFn: () => listWorkspaces(),
  });

  const workspaces = data ?? [];
  const selectedWorkspace = workspaces.find((w) => w.id === pendingWorkspaceId);

  const handleSelect = (id: string | null) => {
    const { pendingSession, createPendingSession } = sessionStore.getState();
    createPendingSession(id);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handleSelect(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="group flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Folder className="size-3.5" />
          <span className="font-medium text-foreground">
            {selectedWorkspace ? selectedWorkspace.name : "选择项目"}
          </span>
          {selectedWorkspace ? (
            <div className="relative ml-0.5 flex size-3 items-center justify-center">
              <ChevronDown className="absolute size-3 transition-opacity group-hover:opacity-0" />
              <X
                className="absolute size-3 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={handleClear}
              />
            </div>
          ) : (
            <ChevronDown className="ml-0.5 size-3" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[240px] p-0 shadow-2xl">
        <Command>
          <CommandInput placeholder="搜索项目" className="h-9 text-xs" />
          <CommandList className="max-h-[180px]">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              无匹配的项目
            </CommandEmpty>
            <CommandGroup>
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={workspace.name || workspace.id}
                  onSelect={() => handleSelect(workspace.id)}
                  className="flex cursor-pointer items-center justify-between gap-2 p-1.5 text-xs text-muted-foreground hover:bg-muted/50 aria-selected:bg-muted/50 aria-selected:text-foreground"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Folder className="size-3.5 shrink-0" />
                    <span className="truncate text-foreground">{workspace.name || "untitled"}</span>
                  </div>
                  {workspace.id === pendingWorkspaceId && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          <div className="my-1 border-t border-border/50" />

          <div className="p-1">
            <button
              onClick={() => {
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-md p-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <div className="flex items-center gap-2">
                <FolderPlus className="size-3.5" />
                <span>添加新项目</span>
              </div>
              <ChevronRight className="size-3.5 opacity-50" />
            </button>
            <button
              onClick={() => handleSelect(null)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md p-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderX className="size-3.5" />
              <span>不使用项目</span>
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
