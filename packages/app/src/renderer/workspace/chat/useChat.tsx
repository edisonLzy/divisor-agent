import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { ResponseChatMessage } from "@shared/message-ipc";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatTimelineMessage, PromptSubmission } from "./chat-types";

function upsertMessage(messages: ChatTimelineMessage[], nextMessage: ChatTimelineMessage) {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) {
    return [...messages, nextMessage];
  }

  const currentMessage = messages[index];
  const nextMessages = [...messages];
  nextMessages[index] = {
    ...currentMessage,
    ...nextMessage,
    createdAt: currentMessage.createdAt,
  };
  return nextMessages;
}

function createRendererErrorMessage(sessionId: string, error: unknown): ResponseChatMessage {
  return {
    id: nanoid(),
    sessionId,
    role: "assistant",
    kind: "response",
    content: error instanceof Error ? error.message : "Prompt failed unexpectedly.",
    status: "error",
    createdAt: Date.now(),
  };
}

export function useChat() {
  const { invoke, on } = useElectronIPC();
  const sessionId = useMemo(() => nanoid(), []);
  const [messages, setMessages] = useState<ChatTimelineMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    void invoke("setSessionId", sessionIdRef.current);

    const unsubscribeChunk = on("agentMessageChunk", ({ sessionId: eventSessionId, message }) => {
      if (eventSessionId !== sessionIdRef.current) {
        return;
      }

      if (message.role !== "assistant") {
        return;
      }

      setMessages((currentMessages) => upsertMessage(currentMessages, message));
    });

    const unsubscribeDone = on("agentMessageDone", ({ sessionId: eventSessionId }) => {
      if (eventSessionId !== sessionIdRef.current) {
        return;
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribeChunk();
      unsubscribeDone();
    };
  }, [invoke, on]);

  const submitPrompt = useCallback(
    async ({ text, document }: PromptSubmission) => {
      const trimmedText = text.trim();
      if (!trimmedText) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: nanoid(),
          sessionId: sessionIdRef.current,
          role: "user",
          kind: "user",
          content: trimmedText,
          document,
          createdAt: Date.now(),
        },
      ]);

      setIsLoading(true);

      try {
        await invoke("prompt", {
          sessionId: sessionIdRef.current,
          content: trimmedText,
        });
      } catch (error) {
        setIsLoading(false);
        setMessages((currentMessages) => [
          ...currentMessages,
          createRendererErrorMessage(sessionIdRef.current, error),
        ]);
      }
    },
    [invoke],
  );

  return {
    isLoading,
    messages,
    submitPrompt,
  };
}
