import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sideChatStore } from "@renderer/store/side-chat";
import type { SideChatArtifactRecord } from "@renderer/store/side-chat/side-chat-slice";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "../../messages";
import { PromptInput } from "../../prompt-input";
import type { PromptSubmission } from "../../prompt-types";

interface SideChatArtifactProps {
  artifact: SideChatArtifactRecord;
}

export function SideChatArtifact({ artifact }: SideChatArtifactProps) {
  const { invoke } = useElectronIPC();
  const streamingEntryId = useStore(sideChatStore, (state) =>
    state.streamingEntryIds.get(artifact.id),
  );
  const entryState = useStore(sideChatStore, (state) => state.getEntryState(artifact.id));
  const messageEntries = useMemo(
    () => entryState.entries.filter(isAgentMessageEntry),
    [entryState.entries],
  );
  const isRunning = entryState.status === "running";

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      sideChatStore.getState().setStatus(artifact.id, "running");
      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      sideChatStore.getState().appendMessageEntry(artifact.id, userMessage);

      try {
        await invoke("setSessionId", artifact.id);
        await invoke("prompt", artifact.id, submission.text, {
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
          skillIds: submission.skillIds,
        });
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
        <PromptInput
          disabled={false}
          isRunning={isRunning}
          onStop={stopPrompt}
          onSubmit={submitPrompt}
          sessionId={artifact.id}
        />
      </div>
    </div>
  );
}
