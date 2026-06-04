import type { UserMessage as UserMessageType } from "@mariozechner/pi-ai";
import { skillNode } from "@renderer/components/richtext/inline/skill-node";
import type { JSONContent } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo } from "react";

import { MessageToolbar, MessageToolbarMenuButton } from "./message-toolbar";

interface UserMessageProps {
  message: UserMessageType;
}

export function UserMessage({ message }: UserMessageProps) {
  const document = useMemo(() => createRichTextDocumentFromUserMessage(message), [message]);
  const editor = useUserMessageEditor(document);

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-3">
      <div className="rounded-[20px] bg-secondary px-4 py-2.5 text-[14px] leading-6 text-secondary-foreground shadow-[0_18px_48px_rgb(15_23_42/0.08)] dark:shadow-[0_18px_48px_rgb(0_0_0/0.2)]">
        <div className="pm-readonly text-[14px] leading-6 text-secondary-foreground">
          <EditorContent editor={editor} className="prompt-editor max-w-none" />
        </div>
      </div>
      <MessageToolbar align="end">
        <MessageToolbarMenuButton align="end" />
      </MessageToolbar>
    </div>
  );
}

function useUserMessageEditor(document: RichTextDocument) {
  return useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          orderedList: false,
          bulletList: false,
        }),
        Mention.extend({
          name: "slashCommandMention",
        }).configure({
          HTMLAttributes: {
            class:
              "mention inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-200",
          },
          renderText({ node, suggestion }) {
            return `${suggestion?.char ?? "/"}${node.attrs.label ?? node.attrs.id ?? ""}`;
          },
        }),
        skillNode,
      ],
      content: document,
      editable: false,
      editorProps: {
        attributes: {
          class: "ProseMirror min-h-0 text-[14px] leading-6 text-secondary-foreground outline-none",
        },
      },
    },
    [document],
  );
}

type RichTextDocument = JSONContent;

function createRichTextDocumentFromUserMessage(message: UserMessageType): RichTextDocument {
  const metadataContent = getUserMessageJsonContent(message);
  if (metadataContent) {
    return metadataContent;
  }

  const content = message.content;

  if (isRichTextDocument(content)) {
    return content;
  }

  if (typeof content === "string") {
    return createParagraphDocument(content);
  }

  if (Array.isArray(content)) {
    const text = content.flatMap((block) => (isTextBlock(block) ? [block.text] : [])).join("\n");

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

function createEmptyRichTextDocument(): RichTextDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return typeof value === "object" && value !== null && "type" in value;
}

function isTextBlock(value: unknown): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function getUserMessageJsonContent(message: UserMessageType): RichTextDocument | null {
  if (!("metadata" in message)) {
    return null;
  }

  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("jsonContent" in metadata)) {
    return null;
  }

  return isRichTextDocument(metadata.jsonContent) ? metadata.jsonContent : null;
}
