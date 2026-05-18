import { MessageResponse } from "@renderer/components/ai-elements/message";

interface AssistantThinkingMessageProps {
  content: string;
}

export function AssistantThinkingMessage({ content }: AssistantThinkingMessageProps) {
  return (
    <MessageResponse className="text-[13px] leading-6 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:text-inherit [&_span]:text-inherit [&_strong]:text-foreground [&_ul]:text-inherit">
      {content}
    </MessageResponse>
  );
}
