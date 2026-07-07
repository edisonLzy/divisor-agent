import type { Usage } from "@earendil-works/pi-ai";
import type { EntryTokenUsage } from "@renderer/apis/sessions";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { isAgentAssistantMessage, isAgentMessageEntry } from "@renderer/lib/is";
import { addUsage } from "@renderer/lib/token-usage";
import { mainStore } from "@renderer/store/main";
import { sideChatStore } from "@renderer/store/side-chat";

export function calculateEntryTokenUsage(
  existing: EntryTokenUsage | undefined,
  latestCall: Usage,
): EntryTokenUsage {
  return {
    turn: existing ? addUsage(existing.turn, latestCall) : latestCall,
    latestCall,
  };
}

export function getCurrentContextTokens(tokenUsage: EntryTokenUsage): number {
  const { latestCall } = tokenUsage;
  return latestCall.input + latestCall.cacheRead + latestCall.cacheWrite + latestCall.output;
}

/** Independently subscribes to completed assistant calls and updates entry usage. */
export function useAgentTokenUsage() {
  useSubscribeAgentEvents({
    message_end: (event) => {
      const { message, sessionId } = event;
      if (!isAgentAssistantMessage(message)) return;

      const store = event.scope === "side-chat" ? sideChatStore : mainStore;
      const streamingEntryId = store.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = store
        .getState()
        .getEntryState(sessionId)
        .entries.find((candidate) => candidate.id === streamingEntryId);
      if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

      store
        .getState()
        .setMessageEntryTokenUsage(
          sessionId,
          streamingEntryId,
          calculateEntryTokenUsage(entry.tokenUsage, message.usage),
        );
    },
  });
}
