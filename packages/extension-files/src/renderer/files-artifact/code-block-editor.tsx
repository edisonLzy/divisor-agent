import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  findNext,
  findPrevious,
  highlightSelectionMatches,
  search,
  SearchQuery,
  searchKeymap,
  setSearchQuery,
} from "@codemirror/search";
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range as CodeMirrorRange,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";
import { computePosition, flip, offset, shift, type VirtualElement } from "@floating-ui/dom";
import { clsx } from "clsx";
import {
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  MessageSquareText,
  Pencil,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { HIGHLIGHT_DECORATION_CLASS } from "../../common/constants";
import type { FileComment, FileCommentRange } from "./index";
import { loadLanguageExtension } from "./language-from-path";

const HIGHLIGHT_DURATION_MS = 1000;

const HIGHLIGHT_DECORATION = Decoration.line({
  attributes: { class: HIGHLIGHT_DECORATION_CLASS },
});

// One-shot flash for freshly-highlighted lines. CodeMirror's decoration
// diffing means the animation only fires when a line gains the class, so
// repeated clicks on the same line briefly remove and re-add it below.
const HIGHLIGHT_INTRO_STYLE = `
@keyframes file-highlight-intro {
  0% {
    background-color: color-mix(in oklch, var(--primary) 28%, transparent);
    box-shadow:
      inset 4px 0 0 color-mix(in oklch, var(--primary) 90%, transparent),
      0 0 0 1px color-mix(in oklch, var(--primary) 32%, transparent);
  }
  45% {
    background-color: color-mix(in oklch, var(--primary) 18%, transparent);
    box-shadow:
      inset 4px 0 0 color-mix(in oklch, var(--primary) 70%, transparent),
      0 0 0 1px color-mix(in oklch, var(--primary) 18%, transparent);
  }
  100% {
    background-color: transparent;
    box-shadow:
      inset 4px 0 0 transparent,
      0 0 0 1px transparent;
  }
}
.cm-line.cm-file-highlight {
  animation: file-highlight-intro ${HIGHLIGHT_DURATION_MS}ms ease-out forwards;
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
    borderRadius: "4px",
    color: "var(--foreground)",
    paddingLeft: "0.5rem",
  },
});

const searchHighlightTheme = EditorView.theme({
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklch, var(--primary) 26%, transparent)",
    borderRadius: "3px",
    outline: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklch, var(--primary) 46%, transparent)",
    outline: "1px solid color-mix(in oklch, var(--primary) 68%, transparent)",
  },
});

const commentTheme = EditorView.theme({
  ".cm-file-comment-underline": {
    textDecorationColor: "var(--comment, #f2c94c)",
    textDecorationLine: "underline",
    textDecorationSkipInk: "none",
    textDecorationThickness: "2px",
    textUnderlineOffset: "4px",
  },
  ".cm-file-comment-widget": {
    boxSizing: "border-box",
    margin: "6px 0 10px",
    maxWidth: "var(--files-comment-card-max-width, 100%)",
    width: "var(--files-comment-card-max-width, 100%)",
  },
  ".cm-file-comment-card": {
    backgroundColor: "var(--card)",
    border: "1px solid color-mix(in oklch, var(--border) 82%, transparent)",
    borderLeft: "3px solid color-mix(in oklch, var(--comment, #f2c94c) 72%, var(--border))",
    borderRadius: "8px",
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
    boxSizing: "border-box",
    color: "var(--foreground)",
    cursor: "pointer",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    maxWidth: "100%",
    overflow: "hidden",
    transition: "border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
    width: "100%",
  },
  ".cm-file-comment-card:hover": {
    backgroundColor: "color-mix(in oklch, var(--card) 94%, var(--muted))",
    borderColor: "color-mix(in oklch, var(--border) 70%, var(--foreground))",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.07)",
  },
  ".cm-file-comment-card.is-active": {
    borderColor: "color-mix(in oklch, var(--comment, #f2c94c) 46%, var(--border))",
    borderLeftColor: "var(--comment, #f2c94c)",
    boxShadow:
      "0 8px 24px rgb(0 0 0 / 0.07), 0 0 0 1px color-mix(in oklch, var(--comment, #f2c94c) 28%, transparent)",
  },
  ".cm-file-comment-header": {
    alignItems: "center",
    borderBottom: "1px solid color-mix(in oklch, var(--border) 58%, transparent)",
    display: "flex",
    gap: "8px",
    minHeight: "32px",
    padding: "6px 8px 6px 9px",
  },
  ".cm-file-comment-dot": {
    backgroundColor: "var(--comment, #f2c94c)",
    borderRadius: "999px",
    boxShadow: "0 0 0 2px color-mix(in oklch, var(--comment, #f2c94c) 18%, transparent)",
    flex: "0 0 auto",
    height: "6px",
    width: "6px",
  },
  ".cm-file-comment-meta": {
    color: "var(--muted-foreground)",
    flex: "1 1 auto",
    fontSize: "11px",
    lineHeight: "16px",
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-file-comment-body": {
    color: "var(--foreground)",
    fontSize: "12px",
    lineHeight: "20px",
    margin: "0",
    padding: "8px 10px 9px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  ".cm-file-comment-empty": {
    color: "var(--muted-foreground)",
  },
  ".cm-file-comment-card textarea": {
    backgroundColor: "color-mix(in oklch, var(--background) 86%, transparent)",
    boxSizing: "border-box",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    maxWidth: "100%",
  },
});

interface CodeBlockEditorProps {
  code: string;
  comments?: FileComment[];
  endLine?: number;
  error?: string;
  filePath?: string;
  highlightExpiresAt?: number;
  highlightRequestId?: number;
  highlightLine?: number;
  language?: string;
  onCommentsChange?: (comments: FileComment[]) => void;
}

interface HighlightRange {
  end?: number;
  expiresAt?: number;
  requestId?: number;
  start?: number;
}

interface PendingSelection {
  range: FileCommentRange;
  x: number;
  y: number;
}

interface DeletedCommentState {
  comment: FileComment;
  index: number;
}

interface DragSelectionState {
  anchor: number;
  head: number;
  moved: boolean;
}

interface SelectionToPendingOptions {
  allowEditorSelection?: boolean;
}

interface CommentCallbacks {
  deleteComment: (commentId: string) => void;
  focusComment: (commentId: string) => void;
  saveComment: (commentId: string, body: string) => void;
}

interface CommentDecorationPayload {
  activeCommentId: string | null;
  callbacksRef: { current: CommentCallbacks };
  comments: FileComment[];
}

const setCommentDecorationsEffect = StateEffect.define<CommentDecorationPayload>();

const commentDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCommentDecorationsEffect)) {
        return buildCommentDecorations(
          transaction.state,
          effect.value.comments,
          effect.value.activeCommentId,
          effect.value.callbacksRef,
        );
      }
    }
    if (transaction.docChanged) {
      return decorations.map(transaction.changes);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function CodeBlockEditor({
  code,
  comments = [],
  language,
  highlightLine,
  endLine,
  highlightExpiresAt,
  highlightRequestId,
  filePath,
  error,
  onCommentsChange,
}: CodeBlockEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const commentPocketRef = useRef<HTMLDivElement | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const pendingToolbarRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isSearchOpenRef = useRef(false);
  // Mutable highlight range; the ViewPlugin reads from this on every
  // update so we can change the highlighted lines without rebuilding the
  // editor (e.g. when the user clicks a different line of the same file).
  const highlightRef = useRef<HighlightRange>({});
  const commentsRef = useRef<FileComment[]>(comments);
  const activeCommentIdRef = useRef<string | null>(null);
  const dragSelectionRef = useRef<DragSelectionState | null>(null);
  const focusScrollFrameRef = useRef<number | null>(null);
  const manualSelectionRef = useRef(false);
  const callbacksRef = useRef<CommentCallbacks>({
    deleteComment: () => {},
    focusComment: () => {},
    saveComment: () => {},
  });
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [commentPocketOpen, setCommentPocketOpen] = useState(false);
  const [deletedComment, setDeletedComment] = useState<DeletedCommentState | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [pendingToolbarStyle, setPendingToolbarStyle] = useState<CSSProperties>({
    opacity: 0,
  });
  const [searchText, setSearchText] = useState("");

  commentsRef.current = comments;
  activeCommentIdRef.current = activeCommentId;

  const commentList = useMemo(
    () =>
      [...comments].sort(
        (a, b) =>
          a.range.startLine - b.range.startLine ||
          a.range.startColumn - b.range.startColumn ||
          a.createdAt - b.createdAt,
      ),
    [comments],
  );
  const searchMatches = useMemo(() => findSearchMatches(code, searchText), [code, searchText]);
  const searchStatus =
    searchText.length === 0
      ? "No query"
      : searchMatches.length === 0
        ? "No results"
        : `${activeMatchIndex || 1}/${searchMatches.length}`;

  const syncActiveMatch = useCallback(() => {
    const view = viewRef.current;
    if (!view || searchMatches.length === 0) {
      setActiveMatchIndex(0);
      return;
    }
    const selection = view.state.selection.main;
    const selectedIndex = searchMatches.findIndex(
      (match) => match.from === selection.from && match.to === selection.to,
    );
    if (selectedIndex >= 0) {
      setActiveMatchIndex(selectedIndex + 1);
      return;
    }
    const nextIndex = searchMatches.findIndex((match) => match.from >= selection.from);
    setActiveMatchIndex(nextIndex >= 0 ? nextIndex + 1 : 1);
  }, [searchMatches]);

  const applySearchQuery = useCallback((query: string) => {
    const view = viewRef.current;
    if (!view) return;
    manualSelectionRef.current = false;
    setPendingToolbarStyle({ opacity: 0 });
    setPendingSelection(null);
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: query,
        }),
      ),
    });
  }, []);

  const openSearch = useCallback(() => {
    isSearchOpenRef.current = true;
    manualSelectionRef.current = false;
    setPendingToolbarStyle({ opacity: 0 });
    setPendingSelection(null);
    setIsSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeSearch = useCallback(() => {
    isSearchOpenRef.current = false;
    manualSelectionRef.current = false;
    setIsSearchOpen(false);
    setSearchText("");
    setActiveMatchIndex(0);
    applySearchQuery("");
    viewRef.current?.focus();
  }, [applySearchQuery]);

  const navigateSearch = useCallback(
    (direction: "next" | "previous") => {
      const view = viewRef.current;
      if (!view || searchText.length === 0 || searchMatches.length === 0) return;
      manualSelectionRef.current = false;
      setPendingToolbarStyle({ opacity: 0 });
      setPendingSelection(null);
      applySearchQuery(searchText);
      const didFind = direction === "next" ? findNext(view) : findPrevious(view);
      if (didFind) requestAnimationFrame(syncActiveMatch);
    },
    [applySearchQuery, searchMatches.length, searchText, syncActiveMatch],
  );

  const emitComments = useCallback(
    (nextComments: FileComment[]) => {
      commentsRef.current = nextComments;
      onCommentsChange?.(nextComments);
    },
    [onCommentsChange],
  );

  const updatePendingSelection = useCallback((nextSelection: PendingSelection | null) => {
    setPendingToolbarStyle({ opacity: 0 });
    setPendingSelection(nextSelection);
  }, []);

  const syncPendingSelection = useCallback(() => {
    window.setTimeout(() => {
      const view = viewRef.current;
      if (!view) return;
      updatePendingSelection(
        selectionToPending(view, {
          allowEditorSelection: manualSelectionRef.current,
        }),
      );
    }, 0);
  }, [updatePendingSelection]);

  const finishPointerSelection = useCallback(
    (event: MouseEvent | PointerEvent) => {
      const dragSelection = dragSelectionRef.current;
      window.setTimeout(() => {
        const view = viewRef.current;
        if (!view) return;
        updatePendingSelection(pointerSelectionToPending(view, event, dragSelection));
        if (dragSelectionRef.current === dragSelection) {
          dragSelectionRef.current = null;
        }
      }, 0);
    },
    [updatePendingSelection],
  );

  const focusComment = useCallback((commentId: string) => {
    const comment = commentsRef.current.find((item) => item.id === commentId);
    if (!comment) return;
    setActiveCommentId(commentId);
    setPendingSelection(null);

    if (focusScrollFrameRef.current !== null) {
      cancelAnimationFrame(focusScrollFrameRef.current);
    }

    focusScrollFrameRef.current = requestAnimationFrame(() => {
      focusScrollFrameRef.current = null;
      const view = viewRef.current;
      const latestComment = commentsRef.current.find((item) => item.id === commentId);
      if (!view || !latestComment) return;
      const positions = commentRangeToPositions(view.state, latestComment.range);
      if (!positions) return;
      view.dispatch({
        effects: EditorView.scrollIntoView(positions.to, { y: "center" }),
      });
    });
  }, []);

  callbacksRef.current = {
    deleteComment: (commentId) => {
      const index = commentsRef.current.findIndex((comment) => comment.id === commentId);
      if (index < 0) return;
      const comment = commentsRef.current[index];
      emitComments(commentsRef.current.filter((item) => item.id !== commentId));
      setDeletedComment({ comment, index });
      if (activeCommentIdRef.current === commentId) {
        setActiveCommentId(null);
      }
    },
    focusComment,
    saveComment: (commentId, body) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      emitComments(
        commentsRef.current.map((comment) =>
          comment.id === commentId ? { ...comment, body: trimmed, updatedAt: Date.now() } : comment,
        ),
      );
    },
  };

  // Mount / unmount the editor when the source file (code/language) changes.
  useEffect(() => {
    const root = editorHostRef.current;
    if (!root) return;

    let view: EditorView | null = null;
    let resizeObserver: ResizeObserver | undefined;
    let cancelled = false;

    Promise.resolve(loadLanguageExtension(language) ?? [])
      .then((langExtensions) => {
        if (cancelled || !editorHostRef.current) return;

        const extensions: Extension[] = [
          lineNumbers(),
          darkGutterTheme,
          fileHighlightTheme,
          searchHighlightTheme,
          commentTheme,
          history(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          indentOnInput(),
          bracketMatching(),
          keymap.of([
            {
              key: "Mod-f",
              run() {
                openSearch();
                return true;
              },
            },
            {
              key: "Escape",
              run() {
                if (!isSearchOpenRef.current) return false;
                closeSearch();
                return true;
              },
            },
          ]),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorState.readOnly.of(true),
          lineHighlightPlugin(highlightRef),
          commentDecorationField,
          EditorView.updateListener.of((update) => {
            if (update.selectionSet) {
              const view = update.view;
              window.setTimeout(() => {
                if (viewRef.current !== view) return;
                updatePendingSelection(
                  selectionToPending(view, {
                    allowEditorSelection: manualSelectionRef.current,
                  }),
                );
              }, 0);
            }
          }),
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              if (event.button !== 0 || isCommentWidgetEvent(event)) {
                return false;
              }
              const pos = positionFromPointer(view, event);
              if (pos === null) {
                return false;
              }
              manualSelectionRef.current = true;
              dragSelectionRef.current = { anchor: pos, head: pos, moved: false };
              updatePendingSelection(null);
              view.dispatch({ selection: { anchor: pos } });
              return false;
            },
            mousemove: (event, view) => {
              const drag = dragSelectionRef.current;
              if (!drag) return false;
              if ((event.buttons & 1) !== 1) return false;
              const pos = positionFromPointer(view, event);
              if (pos === null) return false;
              drag.head = pos;
              drag.moved = drag.moved || pos !== drag.anchor;
              view.dispatch({ selection: { anchor: drag.anchor, head: pos } });
              return false;
            },
            keydown: (event) => {
              if (isCommentWidgetEvent(event)) return false;
              if (isKeyboardSelectionEvent(event)) {
                manualSelectionRef.current = true;
              }
              return false;
            },
            keyup: (_event, view) => {
              window.setTimeout(
                () =>
                  updatePendingSelection(
                    selectionToPending(view, {
                      allowEditorSelection: manualSelectionRef.current,
                    }),
                  ),
                0,
              );
            },
            mouseup: (event, view) => {
              const dragSelection = dragSelectionRef.current;
              updatePendingSelection(pointerSelectionToPending(view, event, dragSelection));
              dragSelectionRef.current = null;
            },
          }),
          ...langExtensions,
        ];

        const state = EditorState.create({ doc: code, extensions });
        view = new EditorView({ state, parent: editorHostRef.current });
        viewRef.current = view;
        updateCommentLayoutVars(view);
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            if (view) updateCommentLayoutVars(view);
          });
          resizeObserver.observe(view.scrollDOM);
        }
        syncCommentDecorations(view, commentsRef.current, activeCommentIdRef.current, callbacksRef);

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
      resizeObserver?.disconnect();
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // We intentionally rebuild the editor only when the source file changes.
    // Highlight line updates are handled by the second effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSearch, code, language, openSearch, updatePendingSelection]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openSearch]);

  useEffect(() => {
    document.addEventListener("selectionchange", syncPendingSelection);
    document.addEventListener("mouseup", finishPointerSelection);
    document.addEventListener("keyup", syncPendingSelection);

    return () => {
      document.removeEventListener("selectionchange", syncPendingSelection);
      document.removeEventListener("mouseup", finishPointerSelection);
      document.removeEventListener("keyup", syncPendingSelection);
    };
  }, [finishPointerSelection, syncPendingSelection]);

  useEffect(() => {
    applySearchQuery(searchText);
    if (searchText.length === 0 || searchMatches.length === 0) {
      setActiveMatchIndex(0);
      return;
    }
    requestAnimationFrame(syncActiveMatch);
  }, [applySearchQuery, searchMatches.length, searchText, syncActiveMatch]);

  useEffect(() => {
    commentsRef.current = comments;
    const view = viewRef.current;
    if (view) {
      return scheduleCommentDecorationsSync(
        view,
        comments,
        activeCommentIdRef.current,
        callbacksRef,
      );
    }
    return undefined;
  }, [comments]);

  useEffect(() => {
    activeCommentIdRef.current = activeCommentId;
    const view = viewRef.current;
    if (view) {
      return scheduleCommentDecorationsSync(
        view,
        commentsRef.current,
        activeCommentId,
        callbacksRef,
      );
    }
    return undefined;
  }, [activeCommentId]);

  useEffect(() => {
    return () => {
      if (focusScrollFrameRef.current !== null) {
        cancelAnimationFrame(focusScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!deletedComment) return undefined;
    const timer = setTimeout(() => setDeletedComment(null), 4500);
    return () => clearTimeout(timer);
  }, [deletedComment]);

  useEffect(() => {
    if (comments.length > 0) return;
    setCommentPocketOpen(false);
  }, [comments.length]);

  useEffect(() => {
    if (!commentPocketOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && commentPocketRef.current?.contains(target)) return;
      setCommentPocketOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCommentPocketOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [commentPocketOpen]);

  useLayoutEffect(() => {
    const toolbar = pendingToolbarRef.current;
    if (!pendingSelection || !toolbar) {
      setPendingToolbarStyle({ opacity: 0 });
      return undefined;
    }

    let active = true;
    const updatePosition = () => {
      const virtualSelection: VirtualElement = {
        getBoundingClientRect: () => new DOMRect(pendingSelection.x, pendingSelection.y, 0, 0),
      };

      computePosition(virtualSelection, toolbar, {
        middleware: [offset(8), flip(), shift({ padding: 8 })],
        placement: "top",
        strategy: "fixed",
      }).then(({ x, y }) => {
        if (!active) return;
        setPendingToolbarStyle({
          left: x,
          opacity: 1,
          top: y,
        });
      });
    };

    updatePosition();
    const container = containerRef.current;
    container?.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);

    return () => {
      active = false;
      container?.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [pendingSelection]);

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

  const addComment = () => {
    if (!pendingSelection) return;
    const nextComment: FileComment = {
      body: "",
      createdAt: Date.now(),
      id: createCommentId(),
      range: pendingSelection.range,
    };
    emitComments([...commentsRef.current, nextComment]);
    setActiveCommentId(nextComment.id);
    setCommentPocketOpen(false);
    manualSelectionRef.current = false;
    setPendingSelection(null);
    viewRef.current?.focus();
  };

  const restoreDeletedComment = () => {
    if (!deletedComment) return;
    const nextComments = [...commentsRef.current];
    nextComments.splice(
      Math.min(deletedComment.index, nextComments.length),
      0,
      deletedComment.comment,
    );
    emitComments(nextComments);
    setActiveCommentId(deletedComment.comment.id);
    setDeletedComment(null);
  };

  if (error) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-background" data-file-path={filePath}>
      {isSearchOpen ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-border/70 bg-background/95 px-2 py-1.5">
          <div className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-input bg-background px-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              aria-label="Search in file"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onChange={(event) => {
                setSearchText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  navigateSearch(event.shiftKey ? "previous" : "next");
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeSearch();
                }
              }}
              placeholder="Search"
              value={searchText}
            />
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
              {searchStatus}
            </span>
          </div>
          <button
            aria-label="Previous match"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            disabled={searchText.length === 0 || searchMatches.length === 0}
            onClick={() => navigateSearch("previous")}
            type="button"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            aria-label="Next match"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            disabled={searchText.length === 0 || searchMatches.length === 0}
            onClick={() => navigateSearch("next")}
            type="button"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            aria-label="Close search"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={closeSearch}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto p-3">
        <style>{HIGHLIGHT_INTRO_STYLE}</style>
        <div
          ref={editorHostRef}
          className="min-h-full"
          onMouseUpCapture={syncPendingSelection}
          onPointerUpCapture={syncPendingSelection}
        />
        {pendingSelection ? (
          <div
            ref={pendingToolbarRef}
            className="fixed z-50 rounded-lg border border-border/70 bg-background/95 p-1 shadow-md supports-backdrop-filter:backdrop-blur-xl"
            style={pendingToolbarStyle}
            onMouseDown={(event) => event.preventDefault()}
          >
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-foreground hover:bg-muted"
              onClick={addComment}
              type="button"
            >
              <MessageSquarePlus className="size-3.5" strokeWidth={1.75} />
              Add comment
            </button>
          </div>
        ) : null}
      </div>
      {commentList.length > 0 ? (
        <div
          ref={commentPocketRef}
          className={clsx(
            "pointer-events-none absolute right-3 z-50 flex max-w-[calc(100%_-_1.5rem)] flex-col items-end gap-2",
            isSearchOpen ? "top-14" : "top-3",
          )}
        >
          <button
            aria-controls="files-comment-pocket-list"
            aria-expanded={commentPocketOpen}
            aria-label={`Show ${commentList.length} file comments`}
            className="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background/95 px-2 text-xs text-foreground shadow-md transition-colors hover:bg-muted supports-backdrop-filter:backdrop-blur-xl"
            onClick={() => setCommentPocketOpen((open) => !open)}
            type="button"
          >
            <MessageSquareText className="size-3.5" strokeWidth={1.75} />
            <span className="font-medium tabular-nums">{commentList.length}</span>
          </button>
          {commentPocketOpen ? (
            <section
              aria-label="Current file comments"
              className="pointer-events-auto w-80 max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/95 text-xs shadow-lg supports-backdrop-filter:backdrop-blur-xl"
              id="files-comment-pocket-list"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                <div className="font-medium text-foreground">Current file comments</div>
                <div className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {commentList.length}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {commentList.map((comment) => {
                  const isActive = comment.id === activeCommentId;
                  return (
                    <button
                      key={comment.id}
                      className={clsx(
                        "grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-md p-2 text-left transition-colors",
                        isActive ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/70",
                      )}
                      onClick={() => focusComment(comment.id)}
                      type="button"
                    >
                      <span className="inline-flex h-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                        {formatCommentRangeLabel(comment.range)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
                          <span>{comment.updatedAt ? "Edited" : "You"}</span>
                          <span>·</span>
                          <span>{formatCommentTime(comment.updatedAt ?? comment.createdAt)}</span>
                        </span>
                        <span className="block truncate leading-5">
                          {formatCommentPreview(comment)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      {deletedComment ? (
        <div className="absolute right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border border-border/70 bg-background/95 px-3 py-2 text-xs shadow-lg supports-backdrop-filter:backdrop-blur-xl">
          <span>Comment deleted</span>
          <button
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-foreground hover:bg-muted/80"
            onClick={restoreDeletedComment}
            type="button"
          >
            <Undo2 className="size-3.5" strokeWidth={1.75} />
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

function findSearchMatches(code: string, searchText: string): Array<{ from: number; to: number }> {
  if (searchText.length === 0) return [];
  const state = EditorState.create({ doc: code });
  const query = new SearchQuery({ search: searchText });
  if (!query.valid) return [];
  const cursor = query.getCursor(state);
  const matches: Array<{ from: number; to: number }> = [];
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    matches.push({ from: next.value.from, to: next.value.to });
  }
  return matches;
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
  const builder: CodeMirrorRange<Decoration>[] = [];
  for (let l = start; l <= last; l++) {
    if (l < 1) continue;
    const line = view.state.doc.line(l);
    builder.push(HIGHLIGHT_DECORATION.range(line.from));
  }
  return Decoration.set(builder);
}

function syncCommentDecorations(
  view: EditorView,
  comments: FileComment[],
  activeCommentId: string | null,
  callbacksRef: { current: CommentCallbacks },
) {
  view.dispatch({
    effects: setCommentDecorationsEffect.of({
      activeCommentId,
      callbacksRef,
      comments,
    }),
  });
}

function scheduleCommentDecorationsSync(
  view: EditorView,
  comments: FileComment[],
  activeCommentId: string | null,
  callbacksRef: { current: CommentCallbacks },
) {
  const frame = requestAnimationFrame(() => {
    syncCommentDecorations(view, comments, activeCommentId, callbacksRef);
  });

  return () => cancelAnimationFrame(frame);
}

function buildCommentDecorations(
  state: EditorState,
  comments: FileComment[],
  activeCommentId: string | null,
  callbacksRef: { current: CommentCallbacks },
): DecorationSet {
  const decorations: CodeMirrorRange<Decoration>[] = [];

  for (const comment of comments) {
    const positions = commentRangeToPositions(state, comment.range);
    if (!positions) continue;

    decorations.push(
      Decoration.mark({
        class:
          comment.id === activeCommentId
            ? "cm-file-comment-underline cm-file-comment-active"
            : "cm-file-comment-underline",
      }).range(positions.from, positions.to),
    );

    const endLine = state.doc.lineAt(positions.to);
    decorations.push(
      Decoration.widget({
        block: true,
        side: 1,
        widget: new CommentWidget(comment, comment.id === activeCommentId, callbacksRef),
      }).range(endLine.to),
    );
  }

  return Decoration.set(decorations, true);
}

class CommentWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly comment: FileComment,
    private readonly isActive: boolean,
    private readonly callbacksRef: { current: CommentCallbacks },
  ) {
    super();
  }

  eq(other: CommentWidget) {
    return (
      other.comment.id === this.comment.id &&
      other.comment.body === this.comment.body &&
      other.comment.updatedAt === this.comment.updatedAt &&
      other.isActive === this.isActive
    );
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-file-comment-widget";
    const root = createRoot(wrapper);
    this.root = root;
    queueMicrotask(() => {
      if (this.root !== root) return;
      root.render(
        <CommentWidgetCard
          callbacksRef={this.callbacksRef}
          comment={this.comment}
          isActive={this.isActive}
        />,
      );
    });
    return wrapper;
  }

  destroy() {
    const root = this.root;
    this.root = null;
    if (root) {
      queueMicrotask(() => root.unmount());
    }
  }

  ignoreEvent() {
    return true;
  }
}

interface CommentWidgetCardProps {
  callbacksRef: { current: CommentCallbacks };
  comment: FileComment;
  isActive: boolean;
}

function CommentWidgetCard({ callbacksRef, comment, isActive }: CommentWidgetCardProps) {
  const [draft, setDraft] = useState(comment.body);
  const [isEditing, setIsEditing] = useState(comment.body.length === 0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(comment.body);
    if (comment.body.length === 0) {
      setIsEditing(true);
    }
  }, [comment.body, comment.id]);

  useEffect(() => {
    if (!isEditing) return undefined;
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  const focusComment = useCallback(() => {
    callbacksRef.current.focusComment(comment.id);
  }, [callbacksRef, comment.id]);

  const cancelEdit = useCallback(() => {
    if (!comment.body) {
      callbacksRef.current.deleteComment(comment.id);
      return;
    }
    setDraft(comment.body);
    setIsEditing(false);
  }, [callbacksRef, comment.body, comment.id]);

  const saveEdit = useCallback(() => {
    const nextBody = draft.trim();
    if (!nextBody) return;
    callbacksRef.current.saveComment(comment.id, nextBody);
    setIsEditing(false);
  }, [callbacksRef, comment.id, draft]);

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, textarea")) return;
    focusComment();
  };

  const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if ((event.target as HTMLElement).closest("button, textarea")) return;
    event.preventDefault();
    focusComment();
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEdit();
    }
  };

  return (
    <section
      className={clsx("cm-file-comment-card", isActive && "is-active")}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      tabIndex={0}
    >
      <div className="cm-file-comment-header">
        <span className="cm-file-comment-dot" />
        <span className="cm-file-comment-meta">
          {comment.updatedAt ? "Edited" : "You"} · {formatCommentRange(comment.range)}
        </span>
        <button
          aria-label="Edit comment"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            setIsEditing(true);
          }}
          type="button"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </button>
        <button
          aria-label="Delete comment"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            callbacksRef.current.deleteComment(comment.id);
          }}
          type="button"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {isEditing ? (
        <div className="cm-file-comment-body">
          <textarea
            ref={textareaRef}
            className="min-h-16 w-full resize-y rounded-md border border-input px-2.5 py-2 text-xs leading-5 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            placeholder="Write a comment..."
            value={draft}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Cmd/Ctrl + Enter to save</span>
            <span className="flex items-center gap-1.5">
              <button
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                onClick={cancelEdit}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                onClick={saveEdit}
                type="button"
              >
                Save
              </button>
            </span>
          </div>
        </div>
      ) : (
        <p className={clsx("cm-file-comment-body", !comment.body && "cm-file-comment-empty")}>
          {comment.body || "Add a note about this selection."}
        </p>
      )}
    </section>
  );
}

function commentRangeToPositions(
  state: EditorState,
  range: FileCommentRange,
): { from: number; to: number } | null {
  if (range.startLine < 1 || range.endLine < 1) return null;
  if (range.startLine > state.doc.lines || range.endLine > state.doc.lines) return null;

  const startLine = state.doc.line(range.startLine);
  const endLine = state.doc.line(range.endLine);
  const from = clamp(startLine.from + range.startColumn, startLine.from, startLine.to);
  const to = clamp(endLine.from + range.endColumn, endLine.from, endLine.to);
  if (from === to) return null;
  return from < to ? { from, to } : { from: to, to: from };
}

function pointerSelectionToPending(
  view: EditorView,
  event: MouseEvent | PointerEvent,
  dragSelection: DragSelectionState | null,
): PendingSelection | null {
  if (dragSelection?.moved && dragSelection.anchor !== dragSelection.head) {
    const pointerPos = positionFromPointer(view, event);
    const head = pointerPos ?? dragSelection.head;
    return positionsToPending(view, dragSelection.anchor, head);
  }

  return selectionToPending(view, { allowEditorSelection: Boolean(dragSelection?.moved) });
}

function positionsToPending(
  view: EditorView,
  anchor: number,
  head: number,
): PendingSelection | null {
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  if (from === to) return null;

  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const selectedText = view.state.doc.sliceString(from, to).trim();
  if (!selectedText) return null;

  const startRect = view.coordsAtPos(from);
  const endRect = view.coordsAtPos(to);
  const rect = endRect ?? startRect;
  if (!rect) return null;

  return {
    range: {
      endColumn: to - endLine.from,
      endLine: endLine.number,
      selectedText,
      startColumn: from - startLine.from,
      startLine: startLine.number,
    },
    x: rect.left + (rect.right - rect.left) / 2,
    y: rect.top,
  };
}

function selectionToPending(
  view: EditorView,
  options: SelectionToPendingOptions = {},
): PendingSelection | null {
  const domPending = domSelectionToPending(view);
  if (domPending) return domPending;

  const domSelection = window.getSelection();
  if (domSelection && !domSelection.isCollapsed && domSelection.toString().trim()) return null;
  if (!options.allowEditorSelection) return null;

  return editorSelectionToPending(view);
}

function editorSelectionToPending(view: EditorView): PendingSelection | null {
  const selection = view.state.selection.main;
  if (selection.empty) return null;

  return positionsToPending(view, selection.from, selection.to);
}

function domSelectionToPending(view: EditorView): PendingSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!selection.toString().trim()) return null;

  if (!selectionTouchesContent(view, range)) return null;

  const rects = Array.from(range.getClientRects());
  const firstRect = rects[0] ?? range.getBoundingClientRect();
  const lastRect = rects[rects.length - 1] ?? firstRect;
  if (!firstRect || !lastRect) return null;

  const viewRect = view.contentDOM.getBoundingClientRect();
  const intersectsEditor =
    firstRect.right >= viewRect.left &&
    firstRect.left <= viewRect.right &&
    firstRect.bottom >= viewRect.top &&
    firstRect.top <= viewRect.bottom;
  if (!intersectsEditor) return null;

  const startPos = view.posAtCoords({
    x: Math.max(firstRect.left + 1, viewRect.left + 1),
    y: firstRect.top + Math.min(firstRect.height / 2, 8),
  });
  const endPos = view.posAtCoords({
    x: Math.min(Math.max(lastRect.right - 1, viewRect.left + 1), viewRect.right - 1),
    y: lastRect.top + Math.min(lastRect.height / 2, 8),
  });
  if (startPos === null || endPos === null || startPos === endPos) return null;

  return positionsToPending(view, startPos, endPos);
}

function positionFromPointer(view: EditorView, event: MouseEvent | PointerEvent): number | null {
  if (!isCodeContentEvent(view, event)) return null;

  const pos = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });
  if (pos === null) return null;

  const line = view.state.doc.lineAt(pos);
  return clamp(pos, line.from, line.to);
}

function isCodeContentEvent(view: EditorView, event: MouseEvent | PointerEvent): boolean {
  const target = view.dom.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".cm-file-comment-widget")) return false;
  return view.contentDOM.contains(target);
}

function isCommentWidgetEvent(event: Event): boolean {
  return (
    event.target instanceof HTMLElement && Boolean(event.target.closest(".cm-file-comment-widget"))
  );
}

function isKeyboardSelectionEvent(event: KeyboardEvent): boolean {
  if (!event.shiftKey) return false;
  return [
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp",
  ].includes(event.key);
}

function selectionTouchesContent(view: EditorView, range: globalThis.Range): boolean {
  const startElement = nodeElement(range.startContainer);
  const endElement = nodeElement(range.endContainer);
  if (!startElement || !endElement) return false;
  return view.contentDOM.contains(startElement) && view.contentDOM.contains(endElement);
}

function nodeElement(node: Node): HTMLElement | null {
  if (node instanceof HTMLElement) return node;
  const parent = node.parentElement;
  return parent instanceof HTMLElement ? parent : null;
}

function updateCommentLayoutVars(view: EditorView) {
  const gutterWidth = view.dom.querySelector(".cm-gutters")?.getBoundingClientRect().width ?? 0;
  const width = Math.max(260, view.scrollDOM.clientWidth - gutterWidth - 24);
  view.dom.style.setProperty("--files-comment-card-max-width", `${Math.floor(width)}px`);
}

function formatCommentRange(range: FileCommentRange) {
  if (range.startLine === range.endLine) {
    return `line ${range.startLine}`;
  }
  return `lines ${range.startLine}-${range.endLine}`;
}

function formatCommentRangeLabel(range: FileCommentRange) {
  if (range.startLine === range.endLine) {
    return range.startLine;
  }
  return `${range.startLine}-${range.endLine}`;
}

function formatCommentPreview(comment: FileComment) {
  const body = comment.body.trim();
  if (body) return body;
  return comment.range.selectedText.trim() || "Add a note about this selection.";
}

function formatCommentTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createCommentId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
