import { useState, useEffect, useMemo } from 'react';
import { Schema } from 'prosemirror-model';
import { invoke } from '@tauri-apps/api/core';
import { useAppState } from '../store/context';
import { useEditor } from '../lib/prosemirror/hooks/use-editor';
import { useEditorEvent } from '../lib/prosemirror/hooks/use-editor-event';
import { clearContent, isEmptyNode } from '../lib/prosemirror/utils';
import { placeholderPlugin } from '../lib/prosemirror/plugins/placeholder';
import ModelSelector from './ModelSelector';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0] as const;
      },
    },
    text: { group: 'inline' },
  },
  marks: {},
});

interface InputBarProps {
  onSessionStart?: (sessionId: string) => void;
}

export default function InputBar({ onSessionStart }: InputBarProps) {
  const { state, dispatch } = useAppState();
  const { activeSessionId, streaming, pendingApproval } = state;
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [sendDisabled, setSendDisabled] = useState(true);

  const isStreaming = !!streaming;
  const isDisabled = isStreaming || !!pendingApproval;

  const currentModel = activeSessionId
    ? (state.sessionModels.get(activeSessionId) ?? state.selectedModel)
    : state.selectedModel;

  const plugins = useMemo(
    () => [
      placeholderPlugin({ placeholder: 'Type a message… (/models to switch model)' }),
    ],
    [],
  );

  const [editorView, editorMountRef] = useEditor({
    schema,
    plugins,
    editable: () => !isDisabled,
  });

  // Keep ProseMirror editable state in sync with React state
  useEffect(() => {
    if (editorView) {
      editorView.setProps({ editable: () => !isDisabled });
    }
  }, [editorView, isDisabled]);

  // Update send button disabled state on content change
  useEditorEvent(editorView, 'docChanged', () => {
    if (!editorView) return;
    setSendDisabled(isEmptyNode(editorView.state.doc));

    // Detect /models slash command
    const text = editorView.state.doc.textContent.trim();
    if (text === '/models') {
      clearContent(editorView);
      setShowModelSelector(true);
    }
  });

  async function handleSend() {
    if (!editorView || isDisabled) return;

    const content = editorView.state.doc.textContent.trim();
    if (!content) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      try {
        const model = currentModel
          ? { providerId: currentModel.providerId, modelId: currentModel.modelId }
          : undefined;
        await invoke('session_start', { sessionId, model });
        dispatch({ type: 'SET_ACTIVE_SESSION', sessionId });
        if (currentModel) {
          dispatch({ type: 'SET_SESSION_MODEL', sessionId, model: currentModel });
        }
        onSessionStart?.(sessionId);
      } catch (err) {
        console.error('Failed to start session:', err);
        return;
      }
    }

    const resolvedSessionId: string = sessionId;
    clearContent(editorView);
    dispatch({ type: 'STREAMING_START', sessionId: resolvedSessionId });

    try {
      await invoke('session_prompt', { sessionId: resolvedSessionId, content });
    } catch (err) {
      console.error('Failed to send prompt:', err);
      dispatch({ type: 'STREAMING_DONE', sessionId: resolvedSessionId });
    }

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
    <>
      {showModelSelector && (
        <ModelSelector onClose={() => setShowModelSelector(false)} />
      )}

      <div className="border-t border-neutral-700 bg-neutral-900 p-3">
        {/* Card: editor + toolbar wrapped in one focusable container */}
        <div
          className={[
            'flex flex-col gap-2 rounded-xl border p-3 transition-all duration-150',
            isDisabled
              ? 'border-neutral-700 opacity-60'
              : 'border-neutral-700 focus-within:border-neutral-500 focus-within:ring-1 focus-within:ring-neutral-600',
          ].join(' ')}
          onKeyDown={handleKeyDown}
        >
          {/* Section 1 — Editor */}
          <section className="min-h-6 max-h-48 overflow-y-auto">
            <div ref={editorMountRef} />
          </section>

          {/* Section 2 — Toolbar */}
          <section className="flex items-center justify-between">
            {/* Left: model info */}
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              {currentModel ? (
                <>
                  <span>{currentModel.modelName}</span>
                  {!currentModel.isBuiltIn && (
                    <span className="rounded bg-blue-900/40 px-1 py-0.5 text-blue-500">
                      custom
                    </span>
                  )}
                </>
              ) : (
                <span className="italic">no model — type /models</span>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              {activeSessionId && !isStreaming && (
                <button
                  className="rounded px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                  onClick={handleFork}
                  title="Fork this session"
                >
                  ⑂ Fork
                </button>
              )}

              {isStreaming ? (
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-600 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800"
                  onClick={() => {/* TODO: abort */}}
                  title="Stop generation"
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-300" />
                  Stop
                </button>
              ) : (
                <button
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                  disabled={sendDisabled || !!pendingApproval}
                  onClick={handleSend}
                  title="Send (Enter)"
                >
                  Send
                  <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2.5a.5.5 0 0 1 .5.5v8.293l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 .708-.708L7.5 11.293V3a.5.5 0 0 1 .5-.5z" transform="rotate(180 8 8)"/>
                  </svg>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
