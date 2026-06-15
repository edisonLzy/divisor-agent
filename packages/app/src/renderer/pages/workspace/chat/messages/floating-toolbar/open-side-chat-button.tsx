import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { mainStore } from "@renderer/store/main";
import { sideChatStore } from "@renderer/store/side-chat";
import { PanelRightOpen } from "lucide-react";
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useStore } from "zustand";

interface OpenSideChatButtonProps {
  selectedText: string;
  sessionId: string;
  sourceEntryId: string;
}

export function OpenSideChatButton({
  selectedText,
  sessionId,
  sourceEntryId,
}: OpenSideChatButtonProps) {
  const { invoke } = useElectronIPC();
  const model = useStore(mainStore, (state) => {
    return state.getSession(sessionId)?.model;
  });

  const handleOpenSideChat = useCallback(async () => {
    const text = selectedText.trim();
    if (!text) return;

    const initialPrompt = `我正在研究主对话中的以下内容，请帮我深入分析：\n\n> ${text.split("\n").join("\n> ")}\n\n请针对以上内容进行分析和讨论。`;
    const sideChatId = uuidv4();

    mainStore.getState().upsertArtifact(sessionId, {
      id: sideChatId,
      type: "side-chat",
      content: {},
      name: text.slice(0, 30) + (text.length > 30 ? "..." : ""),
    });

    sideChatStore
      .getState()
      .initSideChat(
        sideChatId,
        sessionId,
        { sourceEntryId, selectedText: text },
        model,
        initialPrompt,
      );

    const jsonContent = {
      type: "doc" as const,
      content: [
        { type: "paragraph" as const, content: [{ type: "text" as const, text: initialPrompt }] },
      ],
    };
    const userMessage = createAgentUserMessage(jsonContent, initialPrompt);
    sideChatStore.getState().appendMessageEntry(sideChatId, userMessage);

    if (!model) return;

    try {
      await invoke("setSessionId", sideChatId);
      sideChatStore.getState().setStatus(sideChatId, "running");
      void invoke("prompt", sideChatId, initialPrompt, {
        model: { modelId: model.modelId, providerId: model.providerId },
        skillIds: [],
      });
    } catch (error) {
      console.error("Failed to start side chat:", error);
      sideChatStore.getState().setStatus(sideChatId, "idle");
    }
  }, [invoke, model, selectedText, sessionId, sourceEntryId]);

  return (
    <Button size="sm" type="button" variant="secondary" onClick={handleOpenSideChat}>
      <PanelRightOpen data-icon="inline-start" />
      在侧边栏深入讨论
    </Button>
  );
}
