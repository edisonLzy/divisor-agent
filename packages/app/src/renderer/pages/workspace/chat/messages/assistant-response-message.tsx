import { MessageResponse } from "@renderer/components/ai-elements/message";

interface AssistantResponseMessageProps {
  content: string;
}

export function AssistantResponseMessage({ content }: AssistantResponseMessageProps) {
  return (
    <MessageResponse className="text-[15px] leading-7 text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_em]:text-foreground/80 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_pre]:text-foreground [&_span]:text-inherit [&_strong]:text-foreground [&_ul]:text-inherit">
      {content}
    </MessageResponse>
  );
}
