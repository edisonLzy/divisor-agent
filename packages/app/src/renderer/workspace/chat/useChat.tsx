import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createInitialChatRenderState,
  createLocalUserMessage,
  reduceChatAgentEvent,
  type ChatTimelineMessage,
  type PromptSubmission,
} from "./chat-types";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useChat() {
  const { invoke, on } = useElectronIPC();
  const sessionIdRef = useRef<string>(createSessionId());
  const [renderState, setRenderState] = useState(createInitialChatRenderState);

  useEffect(() => {
    void invoke("setSessionId", sessionIdRef.current);

    const unsubscribe = [
      on("agent_start", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("agent_end", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("message_start", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("message_update", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("message_end", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("tool_execution_start", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("tool_execution_update", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
      on("tool_execution_end", (event) => {
        setRenderState((current) => reduceChatAgentEvent(current, event));
      }),
    ];

    return () => {
      for (const off of unsubscribe) {
        off();
      }
    };
  }, [invoke, on]);

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      setRenderState((current) => ({
        ...current,
        isLoading: true,
        messages: [
          ...current.messages,
          createLocalUserMessage(submission.text, submission.document),
        ],
      }));

      try {
        await invoke("prompt", {
          sessionId: sessionIdRef.current,
          content: submission.text,
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        setRenderState((current) => ({
          ...current,
          isLoading: false,
        }));
      }
    },
    [invoke],
  );

  const messages = useMemo<ChatTimelineMessage[]>(() => {
    return renderState.messages;
  }, [renderState.messages]);

  return {
    isLoading: renderState.isLoading,
    messages,
    submitPrompt,
  };
}
