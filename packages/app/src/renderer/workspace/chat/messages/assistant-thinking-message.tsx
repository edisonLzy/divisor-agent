import { MessageResponse } from "@renderer/components/ai-elements/message";

interface AssistantThinkingMessageProps {
  content: string;
}

export function AssistantThinkingMessage({ content }: AssistantThinkingMessageProps) {
  return (
    <MessageResponse className="text-[13px] leading-6 text-[#B5B5B5] [&_a]:text-[#D8D8D8] [&_code]:text-[#E8E8E8] [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_span]:text-inherit [&_strong]:text-[#F2F2F2] [&_ul]:text-inherit">
      {content}
    </MessageResponse>
  );
}
