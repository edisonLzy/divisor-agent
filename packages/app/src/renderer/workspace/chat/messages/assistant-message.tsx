import type { AssistantMessage as AssistantMessageType } from "@mariozechner/pi-ai";

import type { ToolExecutionState } from "../../../store/session";
import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";

interface AssistantMessageProps {
  message: AssistantMessageType;
  toolStates: Map<string, ToolExecutionState>;
}

export function AssistantMessage({ message, toolStates }: AssistantMessageProps) {
  return (
    <>
      {message.content.map((block, index) => {
        if (block.type === "thinking") {
          const thinking = block.thinking.trim();
          if (!thinking) return null;
          return <AssistantThinkingMessage key={`thinking-${index}`} content={thinking} />;
        }

        if (block.type === "text") {
          const text = block.text.trim();
          if (!text) return null;
          return (
            <AssistantResponseMessage
              key={`text-${index}`}
              content={text}
              stopReason={message.stopReason}
              errorMessage={message.errorMessage}
            />
          );
        }

        if (block.type === "toolCall") {
          const toolState = toolStates.get(block.id);
          return (
            <AssistantToolMessage
              key={`tool-${block.id}`}
              toolName={block.name}
              args={block.arguments}
              toolState={toolState}
            />
          );
        }

        return null;
      })}
    </>
  );
}
