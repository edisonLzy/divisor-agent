import { useCallback, useEffect } from "react";

import { useAgentStore } from "./useAgentStore";

/**
 * Hook for integrating React UI logic with the Electron main process (agent runtime).
 * Exposes methods to communicate with the Agent Runtime via Electron IPC.
 */
export function useAgentRuntime() {
  const { isProcessing, setProcessing } = useAgentStore();

  useEffect(() => {
    const removeListener = window.electronAPI.on("agent_end", () => {
      setProcessing(false);
    });

    return removeListener;
  }, [setProcessing]);

  /**
   * Dispatches a prompt to the main process to execute
   */
  const sendPrompt = useCallback(
    (sessionId: string, content: string, modelStr?: string) => {
      setProcessing(true);

      let providerId = "google";
      let modelId = "gemini-3.1-pro-preview";
      if (modelStr && modelStr.includes("/")) {
        const parts = modelStr.split("/");
        providerId = parts[0];
        modelId = parts.slice(1).join("/");
      }

      window.electronAPI
        .invoke("prompt", sessionId, content, {
          model: {
            providerId,
            modelId,
          },
        })
        .catch(console.error);
    },
    [setProcessing],
  );

  /**
   * Fetches available models from the main process.
   * Return type is inferred from the shared IPC method signature.
   */
  const getAvailableModels = useCallback(async () => {
    try {
      return (await window.electronAPI.invoke("getAvailableModels")) ?? [];
    } catch (e) {
      console.error("Failed to get available models:", e);
      return [];
    }
  }, []);

  return {
    isProcessing,
    sendPrompt,
    getAvailableModels,
  };
}
