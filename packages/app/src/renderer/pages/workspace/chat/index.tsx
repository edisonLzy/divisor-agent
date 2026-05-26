import { listWorkspaces, type Workspace } from "@renderer/apis/sessions";
import { ErrorBoundary } from "@renderer/components/ui/error-boundary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { sessionStore } from "@renderer/store/sessions";
import { useQuery } from "@tanstack/react-query";
import { Folder, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "./messages";
import { PromptInput } from "./prompt-input";
import { useChat } from "./use-chat";

const CHAT_VALUE = "__chat__";

export function Chat() {
  const pendingSession = useStore(sessionStore, (s) => s.pendingSession);
  const { isLoading, messageEntries, streamingEntryId, toolStates, submitPrompt } = useChat();
  const activeSessionId = useStore(sessionStore, (s) => s.activeSessionId);

  return (
    <div className="flex h-full flex-col bg-background">
      <ErrorBoundary>
        {pendingSession ? (
          <PendingSessionContent
            isLoading={isLoading}
            pendingWorkspaceId={pendingSession.workspaceId}
            onSubmit={submitPrompt}
          />
        ) : (
          <ActiveSessionContent
            activeSessionId={activeSessionId}
            isLoading={isLoading}
            messageEntries={messageEntries}
            onSubmit={submitPrompt}
            streamingEntryId={streamingEntryId}
            toolStates={toolStates}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}

interface ActiveSessionContentProps {
  activeSessionId: string | null;
  isLoading: boolean;
  messageEntries: Parameters<typeof ChatMessages>[0]["messageEntries"];
  onSubmit: Parameters<typeof PromptInput>[0]["onSubmit"];
  streamingEntryId?: string;
  toolStates: Parameters<typeof ChatMessages>[0]["toolStates"];
}

function ActiveSessionContent({
  activeSessionId,
  isLoading,
  messageEntries,
  onSubmit,
  streamingEntryId,
  toolStates,
}: ActiveSessionContentProps) {
  return (
    <>
      <section className="min-h-0 flex-1 px-6 pt-6">
        <ChatMessages
          messageEntries={messageEntries}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </section>

      <section className="shrink-0 px-6 pb-6 pt-4">
        <PromptInput disabled={isLoading} onSubmit={onSubmit} sessionId={activeSessionId} />
      </section>
    </>
  );
}

interface PendingSessionContentProps {
  isLoading: boolean;
  pendingWorkspaceId: string | null;
  onSubmit: Parameters<typeof PromptInput>[0]["onSubmit"];
}

function PendingSessionContent({
  isLoading,
  pendingWorkspaceId,
  onSubmit,
}: PendingSessionContentProps) {
  return (
    <section className="min-h-0 flex-1 px-6 pt-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center gap-8 pb-16">
        <h1 className="text-center text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          我们应该在 divisor-agent 中构建什么？
        </h1>

        <div className="w-full max-w-3xl">
          <PromptInput disabled={isLoading} onSubmit={onSubmit} sessionId={null} />
          <SessionProfile pendingWorkspaceId={pendingWorkspaceId} />
        </div>
      </div>
    </section>
  );
}

interface SessionProfileProps {
  pendingWorkspaceId: string | null;
}

function SessionProfile({ pendingWorkspaceId }: SessionProfileProps) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background/80">
          <MessageCircle className="size-3.5" />
        </span>
        <span className="truncate">Session Profile</span>
      </div>

      <WorkspaceSelector pendingWorkspaceId={pendingWorkspaceId} />
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
      <SelectTrigger className="h-8 w-60 rounded-full border-border bg-background/90 text-foreground">
        <SelectValue placeholder="选择会话分组" />
      </SelectTrigger>

      <SelectContent align="end" className="w-65">
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
