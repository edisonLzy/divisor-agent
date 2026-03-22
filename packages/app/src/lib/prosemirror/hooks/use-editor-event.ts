import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { EditorView } from 'prosemirror-view';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useEffectEvent<T extends (...args: any[]) => any>(callback: T): T {
  const ref = useRef<T>(callback);

  useLayoutEffect(() => {
    ref.current = callback;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useCallback((...args: any[]) => ref.current(...args), []) as T;
}

interface CustomEditorEvents {
  'selectionChanged': CustomEvent<{ view: EditorView }>;
  'docChanged': CustomEvent<{ view: EditorView }>;
}

declare global {
  interface HTMLElementEventMap extends CustomEditorEvents {}
}

export function useEditorEvent<K extends keyof CustomEditorEvents>(
  view: EditorView | null,
  key: K,
  handler: (event: CustomEditorEvents[K]) => void,
): void {
  const eventHandler = useEffectEvent(handler);

  useEffect(() => {
    if (view === null) {
      return;
    }
    const controller = new AbortController();
    view.dom.addEventListener(key, eventHandler as EventListener, {
      signal: controller.signal,
    });
    return () => {
      controller.abort();
    };
  }, [view]);
}

export function dispatchCustomEvent<K extends keyof CustomEditorEvents>(
  view: EditorView,
  key: K,
): void {
  view.dom.dispatchEvent(new CustomEvent(key, { detail: view }));
}
