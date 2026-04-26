import { Message, MessageContent, MessageResponse } from "@renderer/components/ai-elements/message";

import type { AssistantTimelineMessage } from "../chat-types";

type ResponseMessage = Extract<AssistantTimelineMessage, { kind: "response" }>;

interface AssistantResponseMessageProps {
  message: ResponseMessage;
}

export function AssistantResponseMessage({ message }: AssistantResponseMessageProps) {
  return (
    <Message from="assistant">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-[#7C7C7C]">
        Assistant
      </div>
      <MessageContent>
        <MessageResponse>{message.content}</MessageResponse>
        {message.status === "streaming" ? (
          <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#7C7C7C]">Streaming</div>
        ) : null}
      </MessageContent>
    </Message>
  );
}
