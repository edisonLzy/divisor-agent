import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

import { HIGHLIGHT_DECORATION_CLASS } from "../constants";
import { loadLanguageExtension } from "./language-from-path";

const HIGHLIGHT_DURATION_MS = 2000;

const HIGHLIGHT_DECORATION = Decoration.line({
  attributes: { class: HIGHLIGHT_DECORATION_CLASS },
});

// One-shot intro flash for freshly-highlighted lines. CodeMirror's decoration
// diffing means the `animation` only fires when a line *gains* the
// `cm-file-highlight` class — i.e. on first mount with a range, or when the
// user clicks a different link. Lines that keep the class across renders
// don't re-trigger. Fades from a stronger primary tint down to the steady
// background defined in the CodeMirror theme below.
const HIGHLIGHT_INTRO_STYLE = `
@keyframes file-highlight-intro {
  from {
    background-color: color-mix(in oklch, var(--primary) 28%, transparent);
    box-shadow:
      inset 4px 0 0 color-mix(in oklch, var(--primary) 90%, transparent),
      0 0 0 1px color-mix(in oklch, var(--primary) 32%, transparent);
  }
  to {
    background-color: color-mix(in oklch, var(--primary) 16%, transparent);
    box-shadow:
      inset 4px 0 0 color-mix(in oklch, var(--primary) 74%, transparent),
      0 0 0 1px color-mix(in oklch, var(--primary) 20%, transparent);
  }
}
.cm-line.cm-file-highlight {
  animation: file-highlight-intro 1200ms ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  .cm-line.cm-file-highlight { animation: none; }
}
`;

// CodeMirror's default gutter styling is hardcoded light. Match it to the
// surrounding dark background so the line-number column doesn't appear as a
// bright strip in dark mode.
const darkGutterTheme = EditorView.theme({
  "&": { backgroundColor: "transparent" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "none",
    color: "var(--muted-foreground)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-content": { caretColor: "var(--foreground)" },
});

const fileHighlightTheme = EditorView.theme({
  ".cm-line.cm-file-highlight": {
    backgroundColor: "color-mix(in oklch, var(--primary) 16%, transparent)",
    borderRadius: "4px",
    boxShadow:
      "inset 4px 0 0 color-mix(in oklch, var(--primary) 74%, transparent), 0 0 0 1px color-mix(in oklch, var(--primary) 20%, transparent)",
    color: "var(--foreground)",
    paddingLeft: "0.5rem",
  },
});

interface CodeBlockEditorProps {
  code: string;
  endLine?: number;
  error?: string;
  highlightExpiresAt?: number;
  highlightRequestId?: number;
  highlightLine?: number;
  language?: string;
}

interface HighlightRange {
  end?: number;
  expiresAt?: number;
  requestId?: number;
  start?: number;
}

export function CodeBlockEditor({
  code,
  language,
  highlightLine,
  endLine,
  highlightExpiresAt,
  highlightRequestId,
  error,
}: CodeBlockEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Mutable highlight range; the ViewPlugin reads from this on every
  // update so we can change the highlighted lines without rebuilding the
  // editor (e.g. when the user clicks a different line of the same file).
  const highlightRef = useRef<HighlightRange>({});

  // Mount / unmount the editor when the source file (code/language) changes.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let view: EditorView | null = null;
    let cancelled = false;

    Promise.resolve(loadLanguageExtension(language) ?? [])
      .then((langExtensions) => {
        if (cancelled || !containerRef.current) return;

        const extensions: Extension[] = [
          lineNumbers(),
          darkGutterTheme,
          fileHighlightTheme,
          history(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          indentOnInput(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          lineHighlightPlugin(highlightRef),
          ...langExtensions,
        ];

        const state = EditorState.create({ doc: code, extensions });
        view = new EditorView({ state, parent: containerRef.current });
        viewRef.current = view;

        const { start } = highlightRef.current;
        if (start) {
          const safeLine = Math.min(start, view.state.doc.lines);
          if (safeLine >= 1) {
            const line = view.state.doc.line(safeLine);
            view.dispatch({
              effects: EditorView.scrollIntoView(line.from, { y: "center" }),
            });
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load CodeMirror language extension", err);
      });

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // We intentionally rebuild the editor only when the source file changes.
    // Highlight line updates are handled by the second effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language]);

  // Update the transient highlight range and scroll to the new line, without
  // remounting the editor. Safe to run before the editor mounts — the mount
  // effect reads the ref when building its initial decorations.
  useEffect(() => {
    const previous = highlightRef.current;
    const now = Date.now();
    const isFreshHighlight =
      highlightLine !== undefined && highlightExpiresAt !== undefined && highlightExpiresAt > now;
    const next: HighlightRange = isFreshHighlight
      ? {
          start: highlightLine,
          end: endLine,
          expiresAt: highlightExpiresAt,
          requestId: highlightRequestId,
        }
      : {};
    const isSameRange = previous.start === next.start && previous.end === next.end;
    const isSameRequest =
      isSameRange && previous.requestId === next.requestId && previous.expiresAt === next.expiresAt;
    if (isSameRequest) return undefined;

    highlightRef.current = next;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;

    if (isFreshHighlight) {
      clearTimer = setTimeout(
        () => {
          if (highlightRef.current.requestId !== highlightRequestId) return;
          highlightRef.current = {};
          viewRef.current?.dispatch({});
        },
        Math.min(highlightExpiresAt - now, HIGHLIGHT_DURATION_MS),
      );
    }

    const view = viewRef.current;
    if (!view) {
      return () => {
        if (clearTimer) clearTimeout(clearTimer);
      };
    }

    if (!isFreshHighlight) {
      view.dispatch({});
      return () => {
        if (clearTimer) clearTimeout(clearTimer);
      };
    }

    if (isSameRange) {
      highlightRef.current = {};
      view.dispatch({});
      const frame = requestAnimationFrame(() => {
        highlightRef.current = next;
        scrollToLine(view, highlightLine);
      });
      return () => {
        cancelAnimationFrame(frame);
        if (clearTimer) clearTimeout(clearTimer);
      };
    }

    scrollToLine(view, highlightLine);
    return () => {
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [highlightLine, endLine, highlightExpiresAt, highlightRequestId]);

  if (error) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-background p-3">
      <style>{HIGHLIGHT_INTRO_STYLE}</style>
    </div>
  );
}

function scrollToLine(view: EditorView, lineNumber: number) {
  const safeLine = Math.min(Math.max(lineNumber, 1), view.state.doc.lines);
  const line = view.state.doc.line(safeLine);
  view.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}

function lineHighlightPlugin(highlightRef: { current: HighlightRange }) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(
          view,
          highlightRef.current.start,
          highlightRef.current.end,
        );
      }
      update(u: ViewUpdate) {
        // Recompute on any transaction (we don't know whether the trigger
        // was doc change, scroll, or our own ref mutation).
        this.decorations = buildDecorations(
          u.view,
          highlightRef.current.start,
          highlightRef.current.end,
        );
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function buildDecorations(
  view: EditorView,
  start: number | undefined,
  end: number | undefined,
): DecorationSet {
  if (!start) return Decoration.none;
  const last = Math.min(end ?? start, view.state.doc.lines);
  const builder: Range<Decoration>[] = [];
  for (let l = start; l <= last; l++) {
    if (l < 1) continue;
    const line = view.state.doc.line(l);
    builder.push(HIGHLIGHT_DECORATION.range(line.from));
  }
  return Decoration.set(builder);
}
