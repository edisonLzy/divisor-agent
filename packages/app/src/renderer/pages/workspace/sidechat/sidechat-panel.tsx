import type { AssistantMessage } from "@mariozechner/pi-ai";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentAssistantMessage, isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type SideChatSession } from "@renderer/store";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "../chat/messages";
import { PromptInput } from "../chat/prompt-input";
import type { PromptSubmission } from "../chat/prompt-types";

interface SideChatPanelProps {
  mainSessionId: string;
  sideChat: SideChatSession;
}

export function SideChatPanel({ mainSessionId, sideChat }: SideChatPanelProps) {
  const { invoke } = useElectronIPC();

  const streamingEntryId = useStore(sessionStore, (state) =>
    state.streamingEntryIds.get(sideChat.id),
  );

  const messageEntries = useMemo(
    () => sideChat.entries.filter(isAgentMessageEntry),
    [sideChat.entries],
  );

  const isRunning = sideChat.status === "running";

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      sessionStore.getState().setSideChatStatus(mainSessionId, sideChat.id, "running");
      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      sessionStore.getState().appendSideChatEntry(mainSessionId, sideChat.id, userMessage);

      try {
        await invoke("setSessionId", sideChat.id);
        await invoke("prompt", sideChat.id, submission.text, {
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
          skillIds: submission.skillIds,
        });
      } catch (error) {
        console.error("Failed to submit side chat prompt", error);
        sessionStore.getState().setSideChatStatus(mainSessionId, sideChat.id, "idle");
      }
    },
    [mainSessionId, sideChat.id, invoke],
  );

  const stopPrompt = useCallback(async () => {
    try {
      await invoke("abortPrompt", sideChat.id);
    } catch (error) {
      console.error("Failed to stop side chat prompt", error);
    }
  }, [sideChat.id, invoke]);

  const handleQuoteToMain = useCallback(() => {
    const lastAssistant = [...sideChat.entries].reverse().find((e) => {
      if (!isAgentMessageEntry(e)) return false;
      if (!isAgentAssistantMessage(e.data)) return false;
      return true;
    });

    if (!lastAssistant || !isAgentMessageEntry(lastAssistant)) return;
    if (!isAgentAssistantMessage(lastAssistant.data)) return;

    const assistantData = lastAssistant.data as AssistantMessage;
    const text = (assistantData.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) return;

    const quotedText = `> 来自侧边聊天的结论：\n> ${text.split("\n").join("\n> ")}\n\n`;
    sessionStore.getState().setPendingInsertText(mainSessionId, quotedText);
  }, [mainSessionId, sideChat.entries]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 px-2 pt-2">
        <ChatMessages
          entries={sideChat.entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={sideChat.id}
          streamingEntryId={streamingEntryId}
          toolStates={sideChat.toolStates}
        />
      </div>

      <div className="shrink-0 px-2 pb-2 pt-2">
        {messageEntries.length > 0 && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={handleQuoteToMain}
            >
              引用到主对话
            </button>
          </div>
        )}
        <PromptInput
          disabled={false}
          isRunning={isRunning}
          onStop={stopPrompt}
          onSubmit={submitPrompt}
          sessionId={sideChat.id}
        />
      </div>
    </div>
  );
}
