import { createSession, listWorkspaces, type Workspace } from "@renderer/apis/sessions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { sessionStore } from "@renderer/store/sessions";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Folder, GitBranch, MessageCircle, Monitor } from "lucide-react";
import { useState, type ReactNode } from "react";
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
          <SessionProfile pendingWorkspaceId={pendingWorkspaceId} />
        </div>
      </div>
    </section>
  );
}

const CHAT_VALUE = "__chat__";

interface SessionProfileProps {
  pendingWorkspaceId: string | null;
}

function SessionProfile({ pendingWorkspaceId }: SessionProfileProps) {
  return (
    <div className="mt-2.5 flex items-center gap-2 pl-2">
      <WorkspaceSelector pendingWorkspaceId={pendingWorkspaceId} />

      <div className="flex h-6 flex-none items-center gap-1.5 rounded-[8px] bg-muted/50 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/80">
        <Monitor className="size-3" />
        <span>本地模式</span>
        <ChevronDown className="size-3 opacity-50" />
      </div>

      <div className="flex h-6 flex-none items-center gap-1.5 rounded-[8px] bg-muted/50 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/80">
        <GitBranch className="size-3" />
        <span className="max-w-37.5 truncate">feature/sessions-group</span>
        <ChevronDown className="size-3 opacity-50" />
      </div>
    </div>
  );
}

interface WorkspaceSelectorProps {
  pendingWorkspaceId: string | null;
}

function WorkspaceSelector({ pendingWorkspaceId }: WorkspaceSelectorProps) {
  const { data } = useQuery({
    queryKey: ["workspaces", "pending-selector"],
    queryFn: () => listWorkspaces(),
  });

  const workspaces = data ?? [];
  const selectedValue = pendingWorkspaceId ?? CHAT_VALUE;

  const handleValueChange = (nextValue: string | null) => {
    if (!nextValue) {
      return;
    }

    const nextWorkspaceId = nextValue === CHAT_VALUE ? null : nextValue;
    const { pendingSession, createPendingSession } = sessionStore.getState();

    if (!pendingSession || pendingSession.workspaceId === nextWorkspaceId) {
      return;
    }

    createPendingSession(nextWorkspaceId);
  };

  return (
    <Select value={selectedValue} onValueChange={handleValueChange}>
      <SelectTrigger className="flex h-6 w-auto items-center gap-1.5 rounded-[8px] border-none bg-muted/50 px-2 py-0 text-xs text-muted-foreground shadow-none hover:bg-muted/80 focus:ring-0 [&>svg]:size-3 [&>svg]:opacity-50">
        <SelectValue placeholder="选择会话分组" />
      </SelectTrigger>

      <SelectContent align="start" className="w-65">
        <SelectItem value={CHAT_VALUE}>
          <WorkspaceOption icon={<MessageCircle className="size-3.5" />} label="Chat" />
        </SelectItem>

        {workspaces.map((workspace: Workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            <WorkspaceOption
              icon={<Folder className="size-3.5" />}
              label={workspace.name || "untitled"}
            />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface WorkspaceOptionProps {
  icon: ReactNode;
  label: string;
}

function WorkspaceOption({ icon, label }: WorkspaceOptionProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
