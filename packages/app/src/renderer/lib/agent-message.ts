import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UserMessage } from "@mariozechner/pi-ai";
import { isAgentUserMessage } from "@renderer/lib/is";
import { jsonContentToText } from "@renderer/lib/richtext";
import type { AgentMessageData, AgentUserMessage } from "@renderer/store";
import type { JSONContent } from "@tiptap/core";

export function createAgentUserMessage(content: JSONContent): AgentUserMessage {
  return {
    role: "user",
    content,
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
    content: jsonContentToText(message.content),
  };
}
