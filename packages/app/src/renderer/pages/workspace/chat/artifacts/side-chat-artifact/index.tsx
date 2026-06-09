import type { AssistantMessage } from "@mariozechner/pi-ai";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentAssistantMessage, isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type SideChatArtifactRecord } from "@renderer/store";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "../../messages";
import { PromptInput } from "../../prompt-input";
import { INSERT_PROMPT_TEXT_EVENT } from "../../prompt-insert-event";
import type { PromptSubmission } from "../../prompt-types";

interface SideChatArtifactProps {
  artifact: SideChatArtifactRecord;
  mainSessionId: string;
}

export function SideChatArtifact({ artifact, mainSessionId }: SideChatArtifactProps) {
  const { invoke } = useElectronIPC();
  const content = artifact.content;
  const streamingEntryId = useStore(sessionStore, (state) =>
    state.streamingEntryIds.get(artifact.id),
  );
  const messageEntries = useMemo(
    () => content.entries.filter(isAgentMessageEntry),
    [content.entries],
  );
  const isRunning = content.status === "running";

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      sessionStore.getState().setSideChatArtifactStatus(mainSessionId, artifact.id, "running");
      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      sessionStore.getState().appendSideChatArtifactEntry(mainSessionId, artifact.id, userMessage);

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
        sessionStore.getState().setSideChatArtifactStatus(mainSessionId, artifact.id, "idle");
      }
    },
    [artifact.id, mainSessionId, invoke],
  );

  const stopPrompt = useCallback(async () => {
    try {
      await invoke("abortPrompt", artifact.id);
    } catch (error) {
      console.error("Failed to stop side chat prompt", error);
    }
  }, [artifact.id, invoke]);

  const handleQuoteToMain = useCallback(() => {
    const lastAssistant = [...content.entries].reverse().find((entry) => {
      if (!isAgentMessageEntry(entry)) return false;
      return isAgentAssistantMessage(entry.data);
    });

    if (!lastAssistant || !isAgentMessageEntry(lastAssistant)) return;
    if (!isAgentAssistantMessage(lastAssistant.data)) return;

    const assistantData = lastAssistant.data as AssistantMessage;
    const text = (assistantData.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return;

    const quotedText = `> 来自侧边聊天的结论：\n> ${text.split("\n").join("\n> ")}\n\n`;
    window.dispatchEvent(
      new CustomEvent(INSERT_PROMPT_TEXT_EVENT, {
        detail: {
          sessionId: mainSessionId,
          text: quotedText,
        },
      }),
    );
  }, [content.entries, mainSessionId]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 px-2 pt-2">
        <ChatMessages
          entries={content.entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={artifact.id}
          streamingEntryId={streamingEntryId}
          toolStates={content.toolStates}
        />
      </div>

      <div className="shrink-0 px-2 pb-2 pt-2">
        {messageEntries.length > 0 ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={handleQuoteToMain}
            >
              引用到主对话
            </button>
          </div>
        ) : null}
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
