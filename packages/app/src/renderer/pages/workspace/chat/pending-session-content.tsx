import { createSession, type Workspace } from "@renderer/apis/sessions";
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
import { sessionStore } from "@renderer/store";
import { Check, ChevronDown, Folder, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";

import { useInvalidateStandaloneSessions } from "../sessions/use-standalone-sessions";
import { useWorkspaceList } from "../sessions/use-workspace-list";
import { useInvalidateWorkspaceSessions } from "../sessions/use-workspaces";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";

export function PendingSessionContent() {
  const { invoke } = useElectronIPC();
  const invalidateStandalone = useInvalidateStandaloneSessions();
  const invalidateWorkspaceSessions = useInvalidateWorkspaceSessions();
  const [isLoading, setIsLoading] = useState(false);

  const submitPrompt = async (submission: PromptSubmission) => {
    setIsLoading(true);

    try {
      const store = sessionStore.getState();
      const workspaceId = store.pendingSession?.workspaceId ?? null;

      const newSession = await createSession({
        name: "新对话",
        workspaceId,
        parentSessionId: null,
      });

      store.addSessions([newSession]);
      store.setActiveSessionId(newSession.id);
      store.clearPendingSession();

      await invoke("setSessionId", newSession.id);

      if (workspaceId) {
        await invalidateWorkspaceSessions(workspaceId);
      } else {
        await invalidateStandalone();
      }

      sessionStore.getState().setSessionStatus(newSession.id, "running");

      await invoke("prompt", newSession.id, submission.text, {
        model: {
          modelId: submission.model.modelId,
          providerId: submission.model.providerId,
        },
        jsonContent: submission.jsonContent,
        skillIds: submission.skillIds,
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

export function useWorkspaceSelector() {
  const value = useStore(sessionStore, (state) => state.pendingSession?.workspaceId ?? null);

  const onChange = (nextWorkspaceId: string | null) => {
    sessionStore.getState().createPendingSession(nextWorkspaceId);
  };

  return {
    value,
    onChange,
  };
}

function SessionProfile() {
  const workspaceSelectorProps = useWorkspaceSelector();

  return (
    <div className="mt-2.5 flex items-center gap-2 pl-2">
      <WorkspaceSelector {...workspaceSelectorProps} />
    </div>
  );
}

interface WorkspaceSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

function WorkspaceSelector({ value, onChange }: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: workspaces = [] } = useWorkspaceList();
  const selectedWorkspace = value ? workspaces.find((w) => w.id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="group flex h-6 w-auto max-w-[200px] items-center gap-1.5 rounded-[8px] border-none bg-muted/50 px-2.5 py-0 text-xs text-muted-foreground shadow-none hover:bg-muted/80 hover:text-foreground focus:outline-hidden">
        {selectedWorkspace ? (
          <>
            <Folder className="size-3.5 opacity-50" />
            <span className="truncate text-foreground">{selectedWorkspace.name}</span>
            <div
              className="hidden items-center justify-center group-hover:flex"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="size-3.5 opacity-50 hover:opacity-100" />
            </div>
            <div className="flex items-center justify-center group-hover:hidden">
              <ChevronDown className="size-3.5 opacity-50" />
            </div>
          </>
        ) : (
          <>
            <Folder className="size-3.5 opacity-50" />
            <span className="truncate">选择工作区</span>
            <ChevronDown className="size-3.5 opacity-50" />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[180px] p-0" sideOffset={8}>
        <Command>
          <CommandInput placeholder="搜索项目" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>无匹配的项目</CommandEmpty>
            <CommandGroup>
              {workspaces.map((workspace: Workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={workspace.name || workspace.id}
                  onSelect={() => {
                    onChange(workspace.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{workspace.name}</span>
                  </span>
                  {value === workspace.id && <Check className="ml-auto size-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
