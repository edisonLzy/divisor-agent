import { ChatMessages } from "./messages";
import { PromptInput } from "./prompt-input";
import { useChat } from "./useChat";

export function Chat() {
  const { isLoading, messages, submitPrompt } = useChat();

  console.log(messages);

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      <section className="min-h-0 flex-1 px-6 pt-6">
        <ChatMessages messages={messages} />
      </section>

      <section className="shrink-0 px-6 pb-6 pt-4">
        <PromptInput disabled={isLoading} onSubmit={submitPrompt} />
      </section>
    </div>
  );
}
