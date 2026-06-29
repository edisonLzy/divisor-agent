import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { createSession, renameSession } from "@renderer/apis/sessions";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { activateSession } from "@renderer/lib/activate-session";
import { isAgentMessageEntry } from "@renderer/lib/is";
import type { EntryState, MessageEntry } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { PanelTopOpen, Sparkles, SquarePen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import { ChatMessages } from "../workspace/chat/messages";
import { PermissionApprovalPanel } from "../workspace/chat/permission";
import { PromptInput } from "../workspace/chat/prompt-input";
import type { PromptSubmission } from "../workspace/chat/prompt-types";
import {
  createSessionTitleFromPrompt,
  shouldAutoRenameSession,
} from "../workspace/chat/session-title";
import { useAgentMessages } from "../workspace/use-agent-messages";
import { useAgentSessions } from "../workspace/use-agent-sessions";

const COMPANION_SESSION_KEY = "divisor-agent.companion-session-id";
const EMPTY_COMPANION_ENTRY_STATE: EntryState = {
  entries: [],
  status: "idle",
  toolStates: new Map(),
};

export function CompanionPage() {
  useAgentMessages();
  useAgentSessions();

  const { invoke } = useElectronIPC();
  const [focusRequest, setFocusRequest] = useState(1);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const activeSessionId = useStore(mainStore, (state) => state.activeSessionId);
  const session = useStore(mainStore, (state) =>
    state.activeSessionId ? state.getSession(state.activeSessionId) : undefined,
  );
  const entryState = useStore(mainStore, (state) =>
    state.activeSessionId
      ? state.getEntryState(state.activeSessionId)
      : EMPTY_COMPANION_ENTRY_STATE,
  );
  const permissionRequest = useStore(mainStore, (state) =>
    state.activeSessionId
      ? (state.getPermissionState(state.activeSessionId).requests[0] ?? null)
      : null,
  );

  useSubscribeAgentEvents({
    focus_companion_input: () => setFocusRequest((request) => request + 1),
  });

  useEffect(() => {
    const savedSessionId = localStorage.getItem(COMPANION_SESSION_KEY);
    if (!savedSessionId) return;

    void activateSession(savedSessionId).catch((error) => {
      console.error("Failed to restore companion session", error);
      localStorage.removeItem(COMPANION_SESSION_KEY);
      mainStore.getState().setActiveSessionId(null);
    });
  }, []);

  const isRunning = entryState.status === "running";
  const messageEntries = entryState.entries.filter(isAgentMessageEntry) as MessageEntry[];
  const streamingEntryId = activeSessionId
    ? mainStore.getState().streamingEntryIds.get(activeSessionId)
    : undefined;

  const submit = async (submission: PromptSubmission, kind: AppUserMessage["kind"] = "prompt") => {
    let sessionId = mainStore.getState().activeSessionId;

    try {
      if (!sessionId) {
        setIsCreatingSession(true);
        const nextSession = await createSession({
          name: createSessionTitleFromPrompt(submission.content),
          workspaceId: null,
          parentSessionId: null,
        });
        mainStore.getState().addSessions([nextSession]);
        mainStore.getState().setActiveSessionId(nextSession.id);
        sessionId = nextSession.id;
        localStorage.setItem(COMPANION_SESSION_KEY, sessionId);
        await invoke("setSessionId", sessionId);
      }

      const currentSession = mainStore.getState().getSession(sessionId);
      if (shouldAutoRenameSession(currentSession?.name)) {
        const name = createSessionTitleFromPrompt(submission.content);
        mainStore.getState().setSessionName(sessionId, name);
        void renameSession({ id: sessionId, name });
      }

      mainStore.getState().setStatus(sessionId, "running");
      mainStore.getState().setModel(sessionId, submission.model);
      const message: AppUserMessage = {
        role: "user",
        content: submission.content,
        timestamp: Date.now(),
        kind,
        jsonContent: submission.jsonContent,
        metadata: {
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
          skillIds: submission.skillIds,
        },
      };
      await invoke("prompt", sessionId, message);
    } catch (error) {
      console.error("Failed to submit companion prompt", error);
      if (sessionId) {
        mainStore.getState().setStatus(sessionId, "idle");
      }
      toast.error("发送失败，请重试");
    } finally {
      setIsCreatingSession(false);
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden rounded-[22px] border border-border/80 bg-background/96 text-foreground shadow-[0_30px_100px_rgb(0_0_0/0.5)] supports-backdrop-filter:backdrop-blur-2xl">
      <header className="app-drag-region grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2 pl-1">
          <span className="flex size-6 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
            <Sparkles className="size-3.5" />
          </span>
          <span className="truncate text-xs font-medium">Divisor</span>
        </div>
        <div className="max-w-48 truncate text-[11px] text-muted-foreground">
          {session?.name || "新对话"}
        </div>
        <div className="app-no-drag flex justify-end gap-0.5">
          <HeaderButton
            label="新对话"
            onClick={() => {
              localStorage.removeItem(COMPANION_SESSION_KEY);
              mainStore.getState().setActiveSessionId(null);
              setFocusRequest((request) => request + 1);
            }}
          >
            <SquarePen />
          </HeaderButton>
          <HeaderButton
            label="在主窗口中继续"
            disabled={!activeSessionId}
            onClick={() => activeSessionId && invoke("openSessionInMainWindow", activeSessionId)}
          >
            <PanelTopOpen />
          </HeaderButton>
          <HeaderButton label="关闭" onClick={() => invoke("hideCompanionWindow")}>
            <X />
          </HeaderButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-4 pt-4">
        {activeSessionId ? (
          <ChatMessages
            entries={entryState.entries}
            isRunning={isRunning}
            messageEntries={messageEntries}
            sessionId={activeSessionId}
            streamingEntryId={streamingEntryId}
            toolStates={entryState.toolStates}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center pb-12 text-center">
            <span className="mb-4 flex size-10 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground">
              <Sparkles className="size-5" />
            </span>
            <h1 className="text-lg font-medium tracking-tight">需要我做什么？</h1>
            <p className="mt-1 text-xs text-muted-foreground">从一个问题开始，或把文件拖到这里。</p>
          </div>
        )}
      </main>

      <footer className="shrink-0 px-3 pb-3 pt-2">
        {activeSessionId && permissionRequest ? (
          <PermissionApprovalPanel sessionId={activeSessionId} />
        ) : (
          <PromptInput
            disabled={isCreatingSession}
            focusRequest={focusRequest}
            initialModel={session?.model ?? null}
            isRunning={isRunning}
            onFollowUp={(submission) => submit(submission, "follow-up")}
            onSteer={(submission) => submit(submission, "steering")}
            onStop={async () => {
              if (activeSessionId) {
                await invoke("abortPrompt", activeSessionId);
              }
            }}
            onSubmit={(submission) => submit(submission)}
            sessionId={activeSessionId}
          />
        )}
      </footer>
    </div>
  );
}

function HeaderButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="size-7 rounded-lg text-muted-foreground [&_svg]:size-3.5"
    >
      {children}
    </Button>
  );
}
