import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createTextDocument } from "@renderer/lib/rich-text";
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
      name: "侧边聊天",
    });
    mainStore.getState().setActiveArtifactId(sessionId, sideChatId);

    sideChatStore.getState().appendSideChatMeta(sideChatId, {
      mainSessionId: sessionId,
      context: { sourceEntryId, selectedText: text },
      model,
      pendingPrompt: initialPrompt,
      createdAt: Date.now(),
    });

    if (!model) return;

    try {
      await invoke("setSessionId", sideChatId);
      await invoke("setSessionScope", sideChatId, "side-chat");
      sideChatStore.getState().setStatus(sideChatId, "running");
      const appUserMessage: AppUserMessage = {
        role: "user",
        content: initialPrompt,
        timestamp: Date.now(),
        kind: "prompt",
        jsonContent: createTextDocument(initialPrompt),
        metadata: {
          model: { modelId: model.modelId, providerId: model.providerId },
          skillIds: [],
        },
      };
      void invoke("prompt", sideChatId, appUserMessage);
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
