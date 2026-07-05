import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { mainStore } from "@renderer/store/main";

export function useHumanInTheLoopMessages() {
  useSubscribeAgentEvents(
    {
      permission_requested: (event) => {
        const { sessionId, type: _type, ...request } = event;
        const store = mainStore.getState();
        const existing = store.getEntryState(sessionId).toolStates.get(request.toolCallId);

        store.enqueueHumanInTheLoopRequest(sessionId, request);
        store.setToolState(sessionId, request.toolCallId, {
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          status: "awaiting_approval",
          args: existing?.args ?? request.args,
          details: existing?.details,
          output: existing?.output ?? "Waiting for permission approval...",
          requestId: request.requestId,
          approvalStatus: "pending",
        });
      },

      ask_user_question_requested: (event) => {
        const { sessionId, type: _type, ...request } = event;
        mainStore.getState().enqueueHumanInTheLoopRequest(sessionId, request);
      },
    },
    {
      shouldHandleEvent: (event) => event.scope === "main",
    },
  );
}
