import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BrowserPageAnnotation } from "../common/types";
import AnnotationEditor from "./annotation-editor";
import AnnotationTooltip from "./annotation-tooltip";
import { removeBrowserComment, updateBrowserComment } from "./browser-comment";
import { getBrowserPageWebview } from "./browser-page-webview";

interface ViewportState {
  scrollX: number;
  scrollY: number;
}

interface Props {
  annotations: BrowserPageAnnotation[];
  browserPageId: string;
  editor: Editor | null;
  onAnnotationsChange: (annotations: BrowserPageAnnotation[]) => void;
  webviewGen: number;
}

export function AnnotationViewportMarkers({
  annotations,
  browserPageId,
  editor,
  onAnnotationsChange,
  webviewGen,
}: Props) {
  const [viewport, setViewport] = useState<ViewportState>({
    scrollX: 0,
    scrollY: 0,
  });
  const [hoverMarkerId, setHoverMarkerId] = useState<string | null>(null);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const markerRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const tabAnnotations = useMemo(
    () => annotations.filter((a) => a.browserPageId === browserPageId),
    [annotations, browserPageId],
  );

  // Listen for viewport updates from the preload script via webview ipc-message
  useEffect(() => {
    const webview = getBrowserPageWebview(browserPageId);
    if (!webview) return;

    const handler = (event: unknown) => {
      const e = event as { channel: string; args: unknown[] };
      if (e.channel !== "__divisor-viewport__") return;
      const data = e.args[0] as ViewportState & { type: string };
      setViewport({ scrollX: data.scrollX, scrollY: data.scrollY });
    };

    webview.addEventListener("ipc-message", handler);
    return () => webview.removeEventListener("ipc-message", handler);
  }, [browserPageId, webviewGen]);

  const getMarkerAnchor = useCallback((markerId: string) => {
    const el = markerRefs.current.get(markerId);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top };
  }, []);

  const hoverAnchor = hoverMarkerId ? getMarkerAnchor(hoverMarkerId) : null;
  const hoverComment = tabAnnotations.find((a) => a.id === hoverMarkerId)?.comment ?? "";

  const editingAnchor = editingMarkerId ? getMarkerAnchor(editingMarkerId) : null;

  const handleEditorSave = useCallback(
    (nextComment: string) => {
      if (!editingMarkerId) return;
      const trimmed = nextComment.trim() || "Selected element";
      const updated = annotations.map((a) =>
        a.id === editingMarkerId ? { ...a, comment: trimmed } : a,
      );
      if (editor) updateBrowserComment(editor, editingMarkerId, trimmed);
      onAnnotationsChange(updated);
      setEditingMarkerId(null);
    },
    [editingMarkerId, annotations, editor, onAnnotationsChange],
  );

  const handleEditorDelete = useCallback(() => {
    if (!editingMarkerId) return;
    const updated = annotations.filter((a) => a.id !== editingMarkerId);
    if (editor) removeBrowserComment(editor, editingMarkerId);
    onAnnotationsChange(updated);
    setEditingMarkerId(null);
  }, [editingMarkerId, annotations, editor, onAnnotationsChange]);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }}>
      {tabAnnotations.map((annotation, index) => {
        const rectPage = annotation.payload.target.rectPage;
        const px = rectPage.x - viewport.scrollX;
        const py = rectPage.y - viewport.scrollY;
        const mx = px + rectPage.width / 2 - 12;
        const my = py + rectPage.height - 12;

        return (
          <span
            key={annotation.id}
            ref={(el) => {
              if (el) markerRefs.current.set(annotation.id, el);
              else markerRefs.current.delete(annotation.id);
            }}
            className="pointer-events-auto absolute flex size-6 cursor-pointer select-none items-center justify-center rounded-full border-2 border-[#141111] bg-[#27ccf3] text-[11px] font-extrabold leading-none text-[#141111] shadow-[2px_2px_0_#141111] transition-shadow hover:shadow-none"
            style={{ transform: `translate3d(${mx}px, ${my}px, 0)` }}
            onMouseEnter={() => setHoverMarkerId(annotation.id)}
            onMouseLeave={() => setHoverMarkerId(null)}
            onClick={() => {
              setHoverMarkerId(null);
              setEditingMarkerId(annotation.id);
            }}
          >
            {index + 1}
          </span>
        );
      })}

      {hoverMarkerId && !editingMarkerId && hoverAnchor ? (
        <AnnotationTooltip anchor={hoverAnchor} comment={hoverComment} />
      ) : null}

      {editingMarkerId && editingAnchor ? (
        <AnnotationEditor
          anchor={editingAnchor}
          initialComment={annotations.find((a) => a.id === editingMarkerId)?.comment ?? ""}
          onCancel={() => setEditingMarkerId(null)}
          onDelete={handleEditorDelete}
          onSave={handleEditorSave}
        />
      ) : null}
    </div>
  );
}
