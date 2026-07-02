import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { setLeaf } from "@renderer/apis/sessions";
import { getSelectedCommandIds } from "@renderer/components/richtext/extensions/slash-commands";
import { skillNode } from "@renderer/components/richtext/inline/skill-node";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentUserMessage } from "@renderer/lib/is";
import type { MessageEntry, SessionEntry } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import type { Virtualizer } from "@tanstack/react-virtual";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { toast } from "sonner";

import { useChatEditor } from "../use-chat-editor";
import { CopyMessageButton } from "./toolbar/copy-message-button";
import { EditMessageButton } from "./toolbar/edit-message-button";
import { MessageToolbar } from "./toolbar/message-toolbar";

interface UserMessageProps {
  message: AppUserMessage;
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

const STICKY_TRIGGER_OFFSET = 8;

type MessageVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

interface StickyUserMessageProps {
  message: AppUserMessage;
  onJump: () => void;
}

export function StickyUserMessage({ message, onJump }: StickyUserMessageProps) {
  const readOnlyEditor = useUserMessageEditor(message.jsonContent);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-2">
      <div className="mx-auto w-full max-w-4xl">
        <div className="pointer-events-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border-2 border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-[var(--hard-shadow)]">
          <div className="pm-readonly min-w-0 overflow-hidden text-[14px] leading-6 text-foreground [&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:text-ellipsis [&_.ProseMirror]:!whitespace-nowrap [&_.ProseMirror_p]:overflow-hidden [&_.ProseMirror_p]:text-ellipsis [&_.ProseMirror_p]:!whitespace-nowrap">
            <EditorContent editor={readOnlyEditor} className="prompt-editor max-w-none min-w-0" />
          </div>
          <Button size="sm" variant="outline" onClick={onJump}>
            Click to jump
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UseStickyUserMessageOptions {
  messageEntries: MessageEntry[];
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string;
  virtualizer: MessageVirtualizer;
}

export function useStickyUserMessage({
  messageEntries,
  scrollRef,
  sessionId,
  virtualizer,
}: UseStickyUserMessageOptions) {
  const [activeStickyIndex, setActiveStickyIndex] = useState<number | null>(null);

  const userMessageIndexes = useMemo(
    () =>
      messageEntries.reduce<number[]>((indexes, entry, index) => {
        if (isAgentUserMessage(entry.data)) {
          indexes.push(index);
        }

        return indexes;
      }, []),
    [messageEntries],
  );

  const updateStickyUserMessage = useCallback(() => {
    const scrollOffset = virtualizer.scrollOffset ?? scrollRef.current?.scrollTop ?? 0;
    const viewportTop = scrollOffset + STICKY_TRIGGER_OFFSET;

    let nextStickyIndex: number | null = null;
    for (const index of userMessageIndexes) {
      const measurement = virtualizer.measurementsCache[index];
      if (!measurement || measurement.end > viewportTop) {
        break;
      }

      nextStickyIndex = index;
    }

    setActiveStickyIndex((currentIndex) =>
      currentIndex === nextStickyIndex ? currentIndex : nextStickyIndex,
    );
  }, [scrollRef, userMessageIndexes, virtualizer]);

  const handleStickyScroll = useCallback(() => {
    updateStickyUserMessage();
  }, [updateStickyUserMessage]);

  const handleStickyJump = useCallback(() => {
    if (activeStickyIndex === null) {
      return;
    }

    virtualizer.scrollToIndex(activeStickyIndex, {
      align: "start",
    });
  }, [activeStickyIndex, virtualizer]);

  useEffect(() => {
    setActiveStickyIndex(null);
  }, [sessionId]);

  useEffect(() => {
    updateStickyUserMessage();
  }, [messageEntries, updateStickyUserMessage]);

  const activeStickyEntry =
    activeStickyIndex === null ? null : (messageEntries[activeStickyIndex] ?? null);
  const activeStickyMessage =
    activeStickyEntry && isAgentUserMessage(activeStickyEntry.data) ? activeStickyEntry.data : null;

  return {
    activeStickyMessage,
    handleStickyJump,
    handleStickyScroll,
  };
}

interface ReadonlyUserMessageProps {
  message: AppUserMessage;
  isRunning: boolean;
  onStartEdit: () => void;
}

function ReadonlyUserMessage({ message, isRunning, onStartEdit }: ReadonlyUserMessageProps) {
  const readOnlyEditor = useUserMessageEditor(message.jsonContent);

  const plainText = typeof message.content === "string" ? message.content : "unsupported content";

  return (
    <div className="grid max-w-3xl grid-cols-[34px_minmax(0,1fr)] items-start gap-3">
      <span className="flex size-8.5 items-center justify-center rounded-sm border-2 border-border bg-signal-yellow font-mono text-[10px] font-bold text-accent-foreground shadow-[var(--hard-shadow-sm)]">
        YOU
      </span>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <div className="rounded-md border-2 border-border bg-card px-4 py-2.5 text-[14px] leading-6 text-card-foreground shadow-[var(--hard-shadow-sm)]">
          <div className="pm-readonly min-w-0 text-[14px] leading-6 text-card-foreground">
            <EditorContent editor={readOnlyEditor} className="prompt-editor max-w-none min-w-0" />
          </div>
        </div>
        <MessageToolbar align="start">
          <CopyMessageButton text={plainText} />
          <EditMessageButton isRunning={isRunning} onEdit={onStartEdit} />
        </MessageToolbar>
      </div>
    </div>
  );
}

interface EditableUserMessageProps {
  entries: SessionEntry[];
  entryId: string;
  message: AppUserMessage;
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
    content: message.jsonContent,
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

      mainStore.getState().setSessionEntries(sessionId, rewindEntries);

      const runtimeMessages = rewindEntries
        .filter((entry): entry is MessageEntry => entry.type === "message")
        .map((entry) => entry.data);
      await invoke("setHistoryMessages", sessionId, runtimeMessages);

      onCancel();
      mainStore.getState().setStatus(sessionId, "running");

      const appUserMessage: AppUserMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
        kind: "prompt",
        jsonContent,
        metadata: {
          skillIds: getSelectedCommandIds(editor),
        },
      };
      await invoke("prompt", sessionId, appUserMessage);
    } catch (error) {
      console.error("Failed to resubmit edited message:", error);
      toast.error("发送失败");
      const store = mainStore.getState();
      const session = store.getSession(sessionId);
      if (session) {
        store.setStatus(sessionId, "idle");
      }
    }
  }, [editor, entries, entryId, sessionId, invoke, onCancel]);

  return (
    <div className="ml-auto flex max-w-2xl flex-col items-end gap-1">
      <div className="w-full rounded-md border-2 border-border bg-card px-4 py-2.5 shadow-[var(--hard-shadow-sm)]">
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

function useUserMessageEditor(document: AppUserMessage["jsonContent"]) {
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
              "mention inline-flex items-center gap-1 rounded-sm border border-border bg-signal-yellow px-1.5 py-0.5 text-sm font-bold text-accent-foreground",
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
          class: "ProseMirror min-h-0 text-[14px] leading-6 outline-none",
        },
      },
    },
    [document],
  );
}
