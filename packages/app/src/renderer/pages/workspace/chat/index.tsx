import { ErrorBoundary } from "@renderer/components/ui/error-boundary";
import { sessionStore } from "@renderer/store/sessions";
import { useStore } from "zustand";

import { ChatMessages } from "./messages";
import { PromptInput } from "./prompt-input";
import { useChat } from "./use-chat";

export function Chat() {
  const { isLoading, messageEntries, streamingEntryId, toolStates, submitPrompt } = useChat();
  const activeSessionId = useStore(sessionStore, (s) => s.activeSessionId);

  return (
    <div className="flex h-full flex-col bg-background">
      <ErrorBoundary>
        <section className="min-h-0 flex-1 px-6 pt-6">
          <ChatMessages
            messageEntries={messageEntries}
            streamingEntryId={streamingEntryId}
            toolStates={toolStates}
          />
        </section>

        <section className="shrink-0 px-6 pb-6 pt-4">
          <PromptInput disabled={isLoading} onSubmit={submitPrompt} sessionId={activeSessionId} />
        </section>
      </ErrorBoundary>
    </div>
  );
}
