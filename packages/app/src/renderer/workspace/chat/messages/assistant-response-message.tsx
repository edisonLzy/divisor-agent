import { MessageResponse } from "@renderer/components/ai-elements/message";

interface AssistantResponseMessageProps {
  content: string;
}

export function AssistantResponseMessage({ content }: AssistantResponseMessageProps) {
  return (
    <MessageResponse className="text-[15px] leading-7 text-[#E7E7E7] [&_a]:text-[#F3F3F3] [&_code]:text-[#F5F5F5] [&_em]:text-[#D6D6D6] [&_h1]:text-[#FAFAFA] [&_h2]:text-[#FAFAFA] [&_h3]:text-[#FAFAFA] [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:text-[#E7E7E7] [&_span]:text-inherit [&_strong]:text-[#FFFFFF] [&_ul]:text-inherit">
      {content}
    </MessageResponse>
  );
}
