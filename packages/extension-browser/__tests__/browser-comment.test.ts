import { describe, expect, it } from "vitest";

import { buildBrowserAnnotationViewportBridgeScript } from "../src/main/annotation-viewport-bridge";
import {
  insertBrowserComment,
  removeBrowserComment,
  serializeBrowserComment,
  updateBrowserComment,
} from "../src/renderer/browser-comment";

describe("browser comment serialization", () => {
  it("escapes page-derived data", () => {
    const serialized = serializeBrowserComment({
      annotationId: "annotation-1",
      comment: "Fix <this> & review",
      intent: "fix",
      context: {
        page: {
          sanitizedUrl: "https://example.com/",
          title: "Unsafe <title>",
          viewportWidth: 1200,
          viewportHeight: 800,
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 2,
          capturedAt: new Date().toISOString(),
        },
        target: {
          accessibility: {
            accessibleName: 'Danger "button"',
            ariaLabel: null,
            ariaLabelledBy: null,
            role: "button",
          },
          attributes: {},
          computedStyles: {
            backgroundColor: "",
            border: "",
            borderRadius: "",
            color: "",
            display: "",
            fontFamily: "",
            fontSize: "",
            fontWeight: "",
            height: "",
            lineHeight: "",
            margin: "",
            padding: "",
            position: "",
            textAlign: "",
            width: "",
            zIndex: "",
          },
          cssClasses: "",
          elementPath: "main > button",
          fullPath: "main > button",
          htmlSnippet: "<button onclick=evil()>Go</button>",
          isFixed: false,
          nearbyElements: [],
          rectPage: { height: 20, width: 30, x: 1, y: 2 },
          rectViewport: { height: 20, width: 30, x: 1, y: 2 },
          selector: 'button[title="x"]',
          selectedText: null,
          sourceFile: null,
          tagName: "button",
          textSnippet: "Go & win",
          reactComponents: null,
        },
        nearbyText: ["Nearby <script>"],
        ancestorPath: ["main"],
        screenshot: null,
      },
    });

    expect(serialized).toContain("&lt;this&gt; &amp; review");
    expect(serialized).not.toContain("annotation-1");
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("<button onclick");
  });
});

describe("browser comment prompt sync", () => {
  it("inserts an identified node so later edits can target the same annotation", () => {
    const calls: unknown[] = [];
    const chain = {
      focus() {
        calls.push("focus");
        return chain;
      },
      insertContent(value: unknown) {
        calls.push(value);
        return chain;
      },
      run() {
        calls.push("run");
        return true;
      },
    };
    const editor = { chain: () => chain } as never;

    insertBrowserComment(editor, {
      annotationId: "annotation-1",
      comment: "Tighten this copy",
      context: commentContext(),
      intent: "change",
    });

    expect(calls).toEqual([
      "focus",
      {
        attrs: {
          annotationId: "annotation-1",
          comment: "Tighten this copy",
          context: commentContext(),
          intent: "change",
        },
        type: "browserComment",
      },
      " ",
      "run",
    ]);
  });

  it("updates and removes only the inline node linked to the edited annotation", () => {
    const operations: unknown[] = [];
    const dispatched: unknown[] = [];
    const transaction = {
      delete(from: number, to: number) {
        operations.push(["delete", from, to]);
        return transaction;
      },
      setNodeMarkup(position: number, type: unknown, attrs: unknown) {
        operations.push(["setNodeMarkup", position, type, attrs]);
        return transaction;
      },
    };
    const nodes = [
      {
        attrs: { annotationId: "annotation-1", comment: "Before" },
        nodeSize: 1,
        position: 3,
        type: { name: "browserComment" },
      },
      {
        attrs: { annotationId: "annotation-2", comment: "Keep" },
        nodeSize: 1,
        position: 8,
        type: { name: "browserComment" },
      },
    ];
    const editor = {
      state: {
        doc: {
          descendants(callback: (node: (typeof nodes)[number], position: number) => boolean) {
            for (const node of nodes) callback(node, node.position);
          },
        },
        tr: transaction,
      },
      view: { dispatch: (nextTransaction: unknown) => dispatched.push(nextTransaction) },
    } as never;

    updateBrowserComment(editor, "annotation-1", "After");
    removeBrowserComment(editor, "annotation-2");

    expect(operations).toEqual([
      ["setNodeMarkup", 3, undefined, { annotationId: "annotation-1", comment: "After" }],
      ["delete", 8, 9],
    ]);
    expect(dispatched).toEqual([transaction, transaction]);
  });
});

describe("browser annotation viewport bridge", () => {
  it("builds interactive marker and editor overlay script", () => {
    const script = buildBrowserAnnotationViewportBridgeScript({
      emitViewport: false,
      enabled: true,
      markers: [
        {
          comment: "Tighten this copy",
          computedStyles: emptyComputedStyles(),
          id: "marker-1",
          index: 0,
          intent: "change",
          isFixed: false,
          tagName: "div",
          rectPage: { height: 20, width: 100, x: 10, y: 30 },
          rectViewport: { height: 20, width: 100, x: 10, y: 30 },
        },
      ],
      token: "token",
    });

    // The bridge renders only marker pins and emits `hover`/`open` events;
    // tooltip and editor live in the React host, so the script has no injected
    // tooltip/editor (no showTooltip, no showEditor).
    expect(script).toContain("pointer-events:auto");
    expect(script).toContain("emitMarkerEvent('hover'");
    expect(script).toContain("emitMarkerEvent('open'");
    expect(script).toContain("element.getBoundingClientRect()");
    expect(script).toContain("existing.token = token");
    expect(script).toContain("globalThis[stateKey]?.token || token");
    expect(script).not.toContain("showTooltip");
    expect(script).not.toContain("showEditor");
    expect(script).toContain("Tighten this copy");
  });
});

function emptyComputedStyles() {
  return {
    backgroundColor: "",
    border: "",
    borderRadius: "",
    color: "",
    display: "",
    fontFamily: "",
    fontSize: "",
    fontWeight: "",
    height: "",
    lineHeight: "",
    margin: "",
    padding: "",
    position: "",
    textAlign: "",
    width: "",
    zIndex: "",
  };
}

function commentContext() {
  return {
    ancestorPath: ["main"],
    nearbyText: [],
    page: {
      capturedAt: "2026-01-01T00:00:00.000Z",
      devicePixelRatio: 1,
      sanitizedUrl: "https://example.com/",
      scrollX: 0,
      scrollY: 0,
      title: "Example",
      viewportHeight: 800,
      viewportWidth: 1200,
    },
    screenshot: null,
    target: {
      accessibility: { accessibleName: null, ariaLabel: null, ariaLabelledBy: null, role: null },
      attributes: {},
      computedStyles: emptyComputedStyles(),
      cssClasses: "",
      elementPath: "main > button",
      fullPath: "main > button",
      htmlSnippet: "<button>Go</button>",
      isFixed: false,
      nearbyElements: [],
      reactComponents: null,
      rectPage: { height: 20, width: 100, x: 10, y: 30 },
      rectViewport: { height: 20, width: 100, x: 10, y: 30 },
      selectedText: null,
      selector: "button",
      sourceFile: null,
      tagName: "button",
      textSnippet: "Go",
    },
  };
}
