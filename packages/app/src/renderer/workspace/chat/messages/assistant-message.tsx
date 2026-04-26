import type { AssistantTimelineMessage } from "../chat-types";
import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";

interface AssistantMessageProps {
  message: AssistantTimelineMessage;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  switch (message.kind) {
    case "thinking":
      return <AssistantThinkingMessage message={message} />;
    case "tool":
      return <AssistantToolMessage message={message} />;
    case "response":
      return <AssistantResponseMessage message={message} />;
    default:
      return null;
  }
}
