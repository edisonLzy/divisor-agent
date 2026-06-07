import {
  getSelectedCommandIds,
  useSlashCommandsExtension,
} from "@renderer/components/richtext/extensions/slash-commands";
import { insertSkillNode, skillNode } from "@renderer/components/richtext/inline/skill-node";
import type { CommandItem } from "@renderer/components/richtext/types";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import type { AgentUserMessage, SessionEntry } from "@renderer/store";
import { sessionStore } from "@renderer/store";
import type { AnyExtension } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { CopyMessageButton } from "./toolbar/copy-message-button";
import { EditMessageButton } from "./toolbar/edit-message-button";
import { MessageToolbar } from "./toolbar/message-toolbar";

interface UserMessageProps {
  message: AgentUserMessage;
  entryId: string;
  sessionId: string;
  isRunning: boolean;
  entries: SessionEntry[];
}

export function UserMessage({
  message,
  entryId: _entryId,
  sessionId,
  isRunning,
  entries: _entries,
}: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { invoke } = useElectronIPC();

  // Always create both editors (hook rule — only one is rendered at a time)
  const readOnlyEditor = useUserMessageEditor(message.content);
  const editEditor = useEditMessageEditor(message.content, isEditing);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editEditor) return;

    const jsonContent = editEditor.getJSON();
    const text = editEditor.getText({ blockSeparator: "\n" }).trim();
    if (!text) return;

    setIsEditing(false);

    try {
      sessionStore.getState().setSessionStatus(sessionId, "running");
      const userMessage = createAgentUserMessage(jsonContent, text);
      sessionStore.getState().appendMessageEntry(sessionId, userMessage);

      await invoke("prompt", sessionId, text, {
        skillIds: getSelectedCommandIds(editEditor),
      });
    } catch (error) {
      console.error("Failed to resubmit edited message:", error);
      toast.error("发送失败");
      const store = sessionStore.getState();
      const session = store.getSession(sessionId);
      if (session) {
        store.setSessionStatus(sessionId, "idle");
      }
    }
  }, [editEditor, sessionId, invoke]);

  if (isEditing) {
    return (
      <div className="ml-auto flex max-w-2xl flex-col items-end gap-1">
        <div className="w-full rounded-[20px] border border-border bg-card px-4 py-2.5 shadow-sm">
          <EditorContent editor={editEditor} className="prompt-editor max-w-none" />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleCancelEdit}>
            取消
          </Button>
          <Button size="sm" onClick={handleSaveEdit}>
            保存并重发
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-1">
      <div className="rounded-[20px] bg-secondary px-4 py-2.5 text-[14px] leading-6 text-secondary-foreground shadow-[0_18px_48px_rgb(15_23_42/0.08)] dark:shadow-[0_18px_48px_rgb(0_0_0/0.2)]">
        <div className="pm-readonly text-[14px] leading-6 text-secondary-foreground">
          <EditorContent editor={readOnlyEditor} className="prompt-editor max-w-none" />
        </div>
      </div>
      <MessageToolbar align="end">
        <CopyMessageButton text={message.text} />
        <EditMessageButton isRunning={isRunning} onEdit={handleStartEdit} />
      </MessageToolbar>
    </div>
  );
}

// ── Readonly Editor ───────────────────────────────────────────────────────────

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

// ── Editable Editor (for edit mode) ──────────────────────────────────────────

function useEditMessageEditor(document: AgentUserMessage["content"], isEditing: boolean) {
  const slashCommands = useEditSkillsCommandItems();
  const slashCommandsExtension = useSlashCommandsExtension({
    commands: slashCommands,
    getFloatingReference: useCallback(() => null, []),
    onSelectCommand: useCallback(({ command, editor, range }) => {
      if (command.group === "Skills") {
        insertSkillNode({
          editor,
          range,
          skill: { id: command.id, label: command.name },
        });
      }
    }, []),
  });

  const extensions = useMemo<AnyExtension[]>(
    () => [slashCommandsExtension],
    [slashCommandsExtension],
  );

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
        Placeholder.configure({
          placeholder: "编辑消息...",
        }),
        ...extensions,
        skillNode,
      ],
      content: document,
      editable: isEditing,
      editorProps: {
        attributes: {
          class:
            "ProseMirror min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground outline-none",
        },
      },
    },
    [document, isEditing, extensions],
  );
}

function useEditSkillsCommandItems() {
  // Simple static skill items for the edit mode slash commands
  // Skills are injected inline via existing `/` suggestions
  return useMemo<CommandItem[]>(() => [], []);
}
