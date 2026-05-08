import { ThemeToggle } from "@renderer/components/theme-toggle";

import { ChatMessages } from "./messages";
import { PromptInput } from "./prompt-input";
import { useChat } from "./use-chat";

export function Chat() {
  const { isLoading, messageEntries, streamingEntryId, toolStates, submitPrompt } = useChat();

  return (
    <div className="flex h-full flex-col bg-background">
      <section className="shrink-0 px-6 pt-4">
        <div className="mx-auto flex w-full max-w-4xl justify-end">
          <ThemeToggle />
        </div>
      </section>

      <section className="min-h-0 flex-1 px-6 pt-4">
        <ChatMessages
          messageEntries={messageEntries}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </section>

      <section className="shrink-0 px-6 pb-6 pt-4">
        <PromptInput disabled={isLoading} onSubmit={submitPrompt} />
      </section>
    </div>
  );
}
