import {
  autoUpdate,
  flip,
  inline,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type VirtualElement,
} from "@floating-ui/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { OpenSideChatButton } from "./open-side-chat-button";

interface FloatingToolbarProps {
  children: ReactNode;
  entryId: string;
  sessionId: string;
}

interface SelectionSnapshot {
  range: Range;
  selectedText: string;
}

export function FloatingToolbar({ children, entryId, sessionId }: FloatingToolbarProps) {
  const {
    closeToolbar,
    floatingStyles,
    getFloatingProps,
    isOpen,
    selectedText,
    setFloating,
    setReferenceContainer,
  } = useToolbarPopup();

  return (
    <div ref={setReferenceContainer}>
      {children}
      {isOpen ? (
        <div
          ref={setFloating}
          className="z-50 rounded-sm border-2 border-border bg-background p-1 shadow-[var(--hard-shadow-sm)]"
          style={floatingStyles}
          {...getFloatingProps({
            onClick: () => {
              closeToolbar({ clearSelection: true });
            },
            onMouseDown: (event) => {
              event.preventDefault();
            },
            onPointerDown: (event) => {
              event.preventDefault();
            },
          })}
        >
          <OpenSideChatButton
            selectedText={selectedText}
            sessionId={sessionId}
            sourceEntryId={entryId}
          />
        </div>
      ) : null}
    </div>
  );
}

function useToolbarPopup() {
  const referenceContainerRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<SelectionSnapshot | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const isOpen = selectedText.length > 0;

  const closeToolbar = useCallback((options: { clearSelection?: boolean } = {}) => {
    selectionRef.current = null;
    setSelectedText("");

    if (options.clearSelection) {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  const { context, floatingStyles, refs, update } = useFloating({
    middleware: [inline(), offset(8), flip(), shift({ padding: 8 })],
    onOpenChange: (open) => {
      if (!open) {
        closeToolbar();
      }
    },
    open: isOpen,
    placement: "top",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, {
    outsidePressEvent: "pointerdown",
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  const syncFromSelection = useCallback(() => {
    const snapshot = getSelectionSnapshot(referenceContainerRef.current);

    if (!snapshot) {
      closeToolbar();
      return;
    }

    selectionRef.current = snapshot;
    refs.setPositionReference(
      createRangeVirtualElement(snapshot.range, referenceContainerRef.current!),
    );
    setSelectedText(snapshot.selectedText);
    void update();
  }, [closeToolbar, refs, update]);

  useEffect(() => {
    const handleSelectionChange = () => {
      syncFromSelection();
    };

    const handleMouseUp = () => {
      window.setTimeout(syncFromSelection, 0);
    };

    const handleKeyUp = () => {
      syncFromSelection();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [syncFromSelection]);

  return {
    closeToolbar,
    floatingStyles,
    getFloatingProps,
    isOpen,
    selectedText,
    setFloating: refs.setFloating,
    setReferenceContainer: (node: HTMLDivElement | null) => {
      referenceContainerRef.current = node;
    },
  };
}

function getSelectionSnapshot(container: HTMLDivElement | null): SelectionSnapshot | null {
  if (!container) return null;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const selectedText = selection.toString().trim();
  if (!selectedText) return null;

  const range = selection.getRangeAt(0);
  if (!containsRange(container, range)) return null;

  return {
    range: range.cloneRange(),
    selectedText,
  };
}

function containsRange(container: HTMLElement, range: Range) {
  return (
    containsSelectionNode(container, range.startContainer) &&
    containsSelectionNode(container, range.endContainer)
  );
}

function containsSelectionNode(container: HTMLElement, node: Node) {
  return container.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);
}

function createRangeVirtualElement(range: Range, contextElement: Element): VirtualElement {
  return {
    contextElement,
    getBoundingClientRect: () => {
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return rect;

      return range.getClientRects()[0] ?? rect;
    },
    getClientRects: () => Array.from(range.getClientRects()),
  };
}
