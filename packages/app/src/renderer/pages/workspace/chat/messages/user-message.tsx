import { setLeaf } from "@renderer/apis/sessions";
import { getSelectedCommandIds } from "@renderer/components/richtext/extensions/slash-commands";
import { skillNode } from "@renderer/components/richtext/inline/skill-node";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentMessageToRuntimeMessage, createAgentUserMessage } from "@renderer/lib/agent-message";
import type { AgentUserMessage, MessageEntry, SessionEntry } from "@renderer/store";
import { sessionStore } from "@renderer/store";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useChatEditor } from "../use-chat-editor";
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

export function UserMessage({ message, entryId, sessionId, isRunning, entries }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <EditableUserMessage
        entries={entries}
        entryId={entryId}
        message={message}
        sessionId={sessionId}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <ReadonlyUserMessage
      message={message}
      isRunning={isRunning}
      onStartEdit={() => setIsEditing(true)}
    />
  );
}

interface ReadonlyUserMessageProps {
  message: AgentUserMessage;
  isRunning: boolean;
  onStartEdit: () => void;
}

function ReadonlyUserMessage({ message, isRunning, onStartEdit }: ReadonlyUserMessageProps) {
  const readOnlyEditor = useUserMessageEditor(message.content);

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-1">
      <div className="rounded-[20px] bg-secondary px-4 py-2.5 text-[14px] leading-6 text-secondary-foreground shadow-[0_18px_48px_rgb(15_23_42/0.08)] dark:shadow-[0_18px_48px_rgb(0_0_0/0.2)]">
        <div className="pm-readonly text-[14px] leading-6 text-secondary-foreground">
          <EditorContent editor={readOnlyEditor} className="prompt-editor max-w-none" />
        </div>
      </div>
      <MessageToolbar align="end">
        <CopyMessageButton text={message.text} />
        <EditMessageButton isRunning={isRunning} onEdit={onStartEdit} />
      </MessageToolbar>
    </div>
  );
}

interface EditableUserMessageProps {
  entries: SessionEntry[];
  entryId: string;
  message: AgentUserMessage;
  sessionId: string;
  onCancel: () => void;
}

function EditableUserMessage({
  entries,
  entryId,
  message,
  sessionId,
  onCancel,
}: EditableUserMessageProps) {
  const { invoke } = useElectronIPC();
  const { editor, hasContent } = useChatEditor({
    content: message.content,
    disabled: false,
  });

  const handleSaveEdit = useCallback(async () => {
    if (!editor) return;

    const jsonContent = editor.getJSON();
    const text = editor.getText({ blockSeparator: "\n" }).trim();
    if (!text) return;

    try {
      const targetIndex = entries.findIndex((entry) => entry.id === entryId);
      if (targetIndex < 0) {
        toast.error("无法找到要编辑的消息");
        return;
      }

      const parentEntryId = entries[targetIndex]?.parentId ?? null;
      const rewindEntries = entries.slice(0, targetIndex);

      if (parentEntryId) {
        await setLeaf({ sessionId, entryId: parentEntryId });
      }

      sessionStore.getState().setSessionEntries(sessionId, rewindEntries);

      const runtimeMessages = rewindEntries
        .filter((entry): entry is MessageEntry => entry.type === "message")
        .map((entry) => agentMessageToRuntimeMessage(entry.data));
      await invoke("setHistoryMessages", sessionId, runtimeMessages);

      onCancel();
      sessionStore.getState().setSessionStatus(sessionId, "running");
      const userMessage = createAgentUserMessage(jsonContent, text);
      sessionStore.getState().appendMessageEntry(sessionId, userMessage);

      await invoke("prompt", sessionId, text, {
        skillIds: getSelectedCommandIds(editor),
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
  }, [editor, entries, entryId, sessionId, invoke, onCancel]);

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-1">
      <div className="w-full rounded-[20px] border border-border bg-card px-4 py-2.5 shadow-sm">
        <EditorContent editor={editor} className="prompt-editor max-w-none" />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" disabled={!hasContent} onClick={handleSaveEdit}>
          保存并重发
        </Button>
      </div>
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
