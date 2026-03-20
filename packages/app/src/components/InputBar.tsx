import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { invoke } from '@tauri-apps/api/core';
import { useAppState } from '../store/context';
import { trpc } from '../lib/trpc';

interface InputBarProps {
  onSessionStart?: (sessionId: string) => void;
}

export default function InputBar({ onSessionStart }: InputBarProps) {
  const { state, dispatch } = useAppState();
  const { activeSessionId, streaming, pendingApproval } = state;
  const utils = trpc.useUtils();

  const isDisabled = !!streaming || !!pendingApproval;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable block elements we don't need in a chat input
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[24px] max-h-[200px] overflow-y-auto text-sm leading-relaxed',
      },
    },
    editable: !isDisabled,
  });

  // Keep editor editable in sync with disabled state
  if (editor && editor.isEditable === isDisabled) {
    editor.setEditable(!isDisabled);
  }

  async function handleSend() {
    if (!editor || isDisabled) return;

    const content = editor.getText().trim();
    if (!content) return;

    // Create a new session if none is active
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      try {
        await invoke('session_start', { sessionId });
        dispatch({ type: 'SET_ACTIVE_SESSION', sessionId });
        onSessionStart?.(sessionId);
      } catch (err) {
        console.error('Failed to start session:', err);
        return;
      }
    }

    // sessionId is now guaranteed to be a string
    const resolvedSessionId: string = sessionId;
    editor.commands.clearContent();
    dispatch({ type: 'STREAMING_START', sessionId: resolvedSessionId });

    try {
      await invoke('session_prompt', { sessionId: resolvedSessionId, content });
    } catch (err) {
      console.error('Failed to send prompt:', err);
      dispatch({ type: 'STREAMING_DONE', sessionId: resolvedSessionId });
    }

    // Reload history after response is done
    utils.sessions.history.invalidate({ id: resolvedSessionId });
    utils.sessions.list.invalidate();
  }

  async function handleFork() {
    if (!activeSessionId || isDisabled) return;
    try {
      await invoke('session_fork', { sessionId: activeSessionId });
    } catch (err) {
      console.error('Fork failed:', err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-neutral-700 bg-neutral-900 px-4 py-3">
      <div
        className={`flex min-h-11 items-end gap-3 rounded-lg border px-4 py-2 ${
          isDisabled
            ? 'border-neutral-700 bg-neutral-800/50 opacity-60'
            : 'border-neutral-600 bg-neutral-800 focus-within:border-neutral-400'
        }`}
      >
        <div className="flex-1" onKeyDown={handleKeyDown}>
          <EditorContent editor={editor} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {activeSessionId && (
            <button
              className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-40"
              disabled={isDisabled}
              onClick={handleFork}
              title="Fork this session"
            >
              ⑂ Fork
            </button>
          )}

          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            disabled={isDisabled}
            onClick={handleSend}
          >
            {streaming ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-center text-xs text-neutral-600">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
