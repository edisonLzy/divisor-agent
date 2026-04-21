import { useState } from 'react';
import { useAgentRuntime } from '../../hooks';
import {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    PromptInputHeader,
    PromptInputProvider,
    PromptInputSubmit,
    PromptInputTextarea,
} from "@/mainview/components/ai-elements/prompt-input";

const MODELS = [
    'Claude Sonnet 4.6 - Medium',
    'GPT-4o',
    'Gemini 1.5 Pro',
    'Gemini 3.1 Pro (Preview)'
];

export function InstructionInput() {
    const [prompt, setPrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[0]);
    const { sendPrompt, isProcessing } = useAgentRuntime();

    const handleSend = () => {
        if (!prompt.trim() || isProcessing) return;

        // In a real app, sessionId would come from active session state
        const currentSessionId = 'temp-session-id';
        sendPrompt(currentSessionId, prompt, selectedModel);
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
                                        {MODELS.map((model) => (
                                            <option key={model} value={model} className="bg-[#222222] text-[#D4D4D4]">
                                                {model}
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
