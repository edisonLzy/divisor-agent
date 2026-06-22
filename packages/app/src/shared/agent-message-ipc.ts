import type { UserMessage } from "@mariozechner/pi-ai";
import type { JSONContent } from "@tiptap/core";

export interface AgentUserMessage extends Omit<UserMessage, "content"> {
  content: JSONContent;
  text: string;
}
