import { Message, MessageContent, MessageResponse } from "@renderer/components/ai-elements/message";

import type { AssistantTimelineMessage } from "../chat-types";

type ThinkingMessage = Extract<AssistantTimelineMessage, { kind: "thinking" }>;

interface AssistantThinkingMessageProps {
  message: ThinkingMessage;
}

export function AssistantThinkingMessage({ message }: AssistantThinkingMessageProps) {
  return (
    <Message from="assistant">
      <div className="text-xs font-medium uppercase tracking-[0.22em] text-[#6D6D6D]">Thinking</div>
      <MessageContent className="border border-[#2C2C2C] bg-[#141414] text-[#A3A3A3] shadow-none">
        <MessageResponse className="text-[13px] leading-6 text-inherit">
          {message.content}
        </MessageResponse>
      </MessageContent>
    </Message>
  );
}
