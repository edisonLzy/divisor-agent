import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sideChatStore } from "@renderer/store/side-chat";
import type { SideChatArtifactRecord } from "@renderer/store/side-chat/side-chat-slice";
import type { UserInteractionRequest } from "@shared/user-interaction-ipc";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "../../messages";
import { PromptInput } from "../../prompt-input";
import type { PromptSubmission } from "../../prompt-types";
import { UserInteractionPanel } from "../../user-interaction";

interface SideChatArtifactProps {
  artifact: SideChatArtifactRecord;
}

export function SideChatArtifact({ artifact }: SideChatArtifactProps) {
  const { invoke } = useElectronIPC();
  const streamingEntryId = useStore(sideChatStore, (state) =>
    state.streamingEntryIds.get(artifact.id),
  );
  const entryState = useStore(sideChatStore, (state) => state.getEntryState(artifact.id));
  const meta = useStore(sideChatStore, (state) => state.getSideChatMeta(artifact.id));
  const messageEntries = useMemo(
    () => entryState.entries.filter(isAgentMessageEntry),
    [entryState.entries],
  );
  const isRunning = entryState.status === "running";
  const inputDisabled = meta?.inputDisabled ?? false;
  const pendingUserInteraction = useStore(
    sideChatStore,
    (state) => state.getUserInteractionState(artifact.id).requests[0] ?? null,
  );

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      sideChatStore.getState().setStatus(artifact.id, "running");
      sideChatStore.getState().setSideChatModel(artifact.id, submission.model);

      try {
        await invoke("setSessionId", artifact.id);
        await invoke("setSessionScope", artifact.id, "side-chat");
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp: Date.now(),
          kind: "prompt",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        await invoke("prompt", artifact.id, appUserMessage);
      } catch (error) {
        console.error("Failed to submit side chat prompt", error);
        sideChatStore.getState().setStatus(artifact.id, "idle");
      }
    },
    [artifact.id, invoke],
  );

  const stopPrompt = useCallback(async () => {
    try {
      await invoke("abortPrompt", artifact.id);
    } catch (error) {
      console.error("Failed to stop side chat prompt", error);
    }
  }, [artifact.id, invoke]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 px-2 pt-2">
        <ChatMessages
          entries={entryState.entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={artifact.id}
          streamingEntryId={streamingEntryId}
          toolStates={entryState.toolStates}
        />
      </div>

      <div className="shrink-0 px-2 pb-2 pt-2">
        {pendingUserInteraction ? (
          <SideChatUserInteractionPanel request={pendingUserInteraction} sessionId={artifact.id} />
        ) : (
          <PromptInput
            disabled={inputDisabled}
            initialModel={meta?.model ?? null}
            isRunning={isRunning}
            onStop={stopPrompt}
            onSubmit={submitPrompt}
            sessionId={artifact.id}
          />
        )}
      </div>
    </div>
  );
}

function SideChatUserInteractionPanel({
  request,
  sessionId,
}: {
  request: UserInteractionRequest;
  sessionId: string;
}) {
  return (
    <UserInteractionPanel
      request={request}
      sessionId={sessionId}
      onResolved={(submission) => {
        const store = sideChatStore.getState();
        store.resolveUserInteraction(sessionId, request.requestId, submission);
        if (!request.toolCallId) return;

        const existing = store.getEntryState(sessionId).toolStates.get(request.toolCallId);
        if (!existing || existing.status === "done" || existing.status === "error") return;
        store.setToolState(sessionId, request.toolCallId, {
          ...existing,
          status: "running",
          output:
            submission.status === "dismissed"
              ? "User dismissed the request."
              : "User response submitted.",
        });
      }}
    />
  );
}
