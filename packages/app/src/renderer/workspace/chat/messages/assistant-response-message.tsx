import { Message, MessageContent, MessageResponse } from "@renderer/components/ai-elements/message";

import type { AssistantTimelineMessage } from "../chat-types";

type ResponseMessage = Extract<AssistantTimelineMessage, { kind: "response" }>;

interface AssistantResponseMessageProps {
  message: ResponseMessage;
}

function statusLabel(status: ResponseMessage["status"]) {
  switch (status) {
    case "streaming":
      return "Streaming";
    case "error":
      return "Error";
    case "aborted":
      return "Aborted";
    default:
      return null;
  }
}

export function AssistantResponseMessage({ message }: AssistantResponseMessageProps) {
  const label = statusLabel(message.status);

  return (
    <Message from="assistant">
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-[#7C7C7C]">
        <span>Assistant</span>
        {label ? (
          <span className="rounded-full border border-[#343434] px-2 py-1 text-[10px] tracking-[0.16em] text-[#B8B8B8]">
            {label}
          </span>
        ) : null}
      </div>
      <MessageContent className="rounded-[22px] border border-[#2B2B2B] bg-[#181818] px-5 py-4 shadow-none">
        <MessageResponse className="text-[15px] leading-7 text-[#E7E7E7] [&_a]:text-[#F3F3F3] [&_code]:text-[#F5F5F5] [&_em]:text-[#D6D6D6] [&_h1]:text-[#FAFAFA] [&_h2]:text-[#FAFAFA] [&_h3]:text-[#FAFAFA] [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:text-[#E7E7E7] [&_span]:text-inherit [&_strong]:text-[#FFFFFF] [&_ul]:text-inherit">
          {message.content}
        </MessageResponse>
      </MessageContent>
    </Message>
  );
}
