import { skillNode } from "@renderer/components/richtext/inline/skill-node";
import type { AgentUserMessage } from "@renderer/store";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { MessageToolbar, MessageToolbarMenuButton } from "./message-toolbar";

interface UserMessageProps {
  message: AgentUserMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  const editor = useUserMessageEditor(message.content);

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

function useUserMessageEditor(document: AgentUserMessage["content"]) {
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
