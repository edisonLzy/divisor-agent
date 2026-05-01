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
      <MessageContent className="rounded-[20px] border border-[#2C2C2C] bg-[#141414] px-4 py-3 text-[#B5B5B5] shadow-none">
        <MessageResponse className="text-[13px] leading-6 text-[#B5B5B5] [&_a]:text-[#D8D8D8] [&_code]:text-[#E8E8E8] [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_span]:text-inherit [&_strong]:text-[#F2F2F2] [&_ul]:text-inherit">
          {message.content}
        </MessageResponse>
      </MessageContent>
    </Message>
  );
}
