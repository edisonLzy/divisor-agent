import { useCallback, useEffect } from 'react';
import { useAgentStore } from './useAgentStore';
import type { BunToWebViewMessage, SessionPromptParams } from '../../shared/ipc-types';

declare global {
  interface Window {
    electrobun?: {
      rpc?: {
        request: (method: string, params: any) => Promise<any>;
      };
    };
  }
}

/**
 * Hook for integrating React UI logic with the main Bun process (agent runtime).
 * Exposes methods to communicate with the Agent Runtime and syncs its state to Zustand.
 */
export function useAgentRuntime() {
  const { isProcessing, setProcessing } = useAgentStore();

  useEffect(() => {
    // Setup listener for messages pushed by Bun
    const messageHandler = (e: MessageEvent) => {
      const message = e.data as BunToWebViewMessage;
      console.log('Received message from Bun:', message);

      if (message.event === 'agentMessageDone') {
        setProcessing(false);
      }
      // TODO: Handle agentMessageChunk, sessionRequestPermission, etc.
    };

    // Electrobun webview environment standard mechanism for receiving pushing events
    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, [setProcessing]);

  /**
   * Dispatches a prompt to the Bun backend to execute
   */
  const sendPrompt = useCallback((sessionId: string, content: string, modelStr: string = 'Gemini 3.1 Pro (Preview)') => {
    setProcessing(true);
    
    // Parse model string if needed, depending on convention
    const params: SessionPromptParams = {
      sessionId,
      content,
      model: {
        providerId: 'google',
        modelId: modelStr
      }
    };
    
    // Dispatch through Electrobun RPC
    window.electrobun?.rpc?.request('sessionPrompt', params).catch(console.error);
  }, [setProcessing]);

  return {
    isProcessing,
    sendPrompt,
  };
}