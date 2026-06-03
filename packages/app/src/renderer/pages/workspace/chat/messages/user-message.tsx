import type { UserMessage as UserMessageType } from "@mariozechner/pi-ai";
import {
  createEmptyRichTextDocument,
  RichTextDocumentView,
  type RichTextDocument,
} from "@renderer/components/richtext";
import { useMemo } from "react";

import { MessageToolbar, MessageToolbarMenuButton } from "./message-toolbar";

interface UserMessageProps {
  message: UserMessageType;
}

export function UserMessage({ message }: UserMessageProps) {
  const document = useMemo(() => createRichTextDocumentFromUserMessage(message), [message]);

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-3">
      <div className="rounded-[22px] bg-secondary px-5 py-4 text-[15px] leading-7 text-secondary-foreground shadow-[0_18px_48px_rgb(15_23_42/0.08)] dark:shadow-[0_18px_48px_rgb(0_0_0/0.2)]">
        <div className="pm-readonly text-[15px] leading-7 text-secondary-foreground">
          <RichTextDocumentView document={document} />
        </div>
      </div>
      <MessageToolbar align="end">
        <MessageToolbarMenuButton align="end" />
      </MessageToolbar>
    </div>
  );
}

function createRichTextDocumentFromUserMessage(message: UserMessageType): RichTextDocument {
  const content = message.content;

  if (isRichTextDocument(content)) {
    return content;
  }

  if (typeof content === "string") {
    return createParagraphDocument(content);
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return createParagraphDocument(text);
  }

  return createEmptyRichTextDocument();
}

function createParagraphDocument(text: string): RichTextDocument {
  const normalized = text.trim();
  if (!normalized) {
    return createEmptyRichTextDocument();
  }

  const paragraphs = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: paragraphs.length
      ? paragraphs.map((line) => ({
          type: "paragraph",
          content: [{ type: "text", text: line }],
        }))
      : [{ type: "paragraph" }],
  };
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return typeof value === "object" && value !== null && "type" in value;
}
