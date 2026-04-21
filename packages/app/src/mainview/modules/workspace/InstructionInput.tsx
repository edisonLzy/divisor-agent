import { useState, useEffect } from 'react';
import { useAgentRuntime } from '../../hooks';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/mainview/components/ai-elements/prompt-input';

export function InstructionInput() {
  const [prompt, setPrompt] = useState('');
  const [models, setModels] = useState<{ providerId: string, modelId: string, modelName: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const { sendPrompt, isProcessing, getAvailableModels } = useAgentRuntime();

  useEffect(() => {
    let mounted = true;
    getAvailableModels().then((m: { providerId: string, modelId: string, modelName: string }[]) => {
      if (mounted && m && m.length > 0) {
        setModels(m);
        // Try to find Gemini 3.1 Pro (Preview) first, otherwise use first available
        const defaultModel = m.find(model => model.modelName?.includes('Gemini 3.1') || model.modelName?.includes('gemini'));
        setSelectedModel(defaultModel ? `${defaultModel.providerId}/${defaultModel.modelId}` : `${m[0].providerId}/${m[0].modelId}`);
      }
    }).catch(console.error);

    return () => {
      mounted = false;
    };
  }, [getAvailableModels]);

  const handleSend = () => {
    if (!prompt.trim() || isProcessing) return;

    // In a real app, sessionId would come from active session state
    const currentSessionId = 'temp-session-id';
    sendPrompt(currentSessionId, prompt, selectedModel || undefined);
    console.log('Sending prompt:', prompt, 'using model:', selectedModel);

    setPrompt('');
  };

  return (
    <div className="p-4 bg-[#111111]">
      <div className="max-w-3xl mx-auto w-full">
        <PromptInputProvider>
          <PromptInput
            onSubmit={handleSend}
            className="h-auto flex-col items-stretch bg-[#141414] border border-[#2C2C2C] focus-within:border-[#9E9E9E] rounded-lg">
            <PromptInputBody>
              <PromptInputHeader className="px-3 pt-2" />
              <PromptInputTextarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Run tasks in the background with the Copilot CLI, type '#' for adding context"
                className="w-full bg-transparent text-sm text-[#D4D4D4] placeholder-[#666666] p-3 resize-none outline-none border-none focus-visible:ring-0 min-h-[80px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <PromptInputFooter
                className="flex items-center justify-between px-3 py-2 border-t border-[#2C2C2C]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#666666]">Agent:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isProcessing}
                    className="bg-transparent text-xs text-[#9E9E9E] hover:text-[#D4D4D4] outline-none cursor-pointer appearance-none disabled:opacity-50"
                  >
                    {models.map((model) => (
                      <option key={`${model.providerId}/${model.modelId}`} value={`${model.providerId}/${model.modelId}`} className="bg-[#222222] text-[#D4D4D4]">
                        {model.modelName}
                      </option>
                    ))}
                  </select>
                </div>
                <PromptInputSubmit
                  disabled={!prompt.trim() || isProcessing}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="p-1 text-[#666666] hover:text-[#D4D4D4] disabled:opacity-50 disabled:hover:text-[#666666] transition-colors bg-transparent hover:bg-transparent"
                  title="Send Message"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </PromptInputProvider>
      </div>
    </div>
  );
}
