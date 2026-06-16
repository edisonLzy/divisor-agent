import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UserMessage } from "@mariozechner/pi-ai";
import { isAgentUserMessage } from "@renderer/lib/is";
import type { AgentMessageData, AgentUserMessage } from "@renderer/store/entries-slice";
import type { JSONContent } from "@tiptap/core";

export function createTextDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

export function createAgentUserMessage(content: JSONContent, text: string): AgentUserMessage {
  return {
    role: "user",
    content,
    text,
    timestamp: Date.now(),
  };
}

export function agentMessageToRuntimeMessage(message: AgentMessageData): AgentMessage {
  if (!isAgentUserMessage(message)) {
    return message;
  }

  return agentUserMessageToUserMessage(message);
}

function agentUserMessageToUserMessage(message: AgentUserMessage): UserMessage {
  return {
    ...message,
    content: message.text,
  };
}
