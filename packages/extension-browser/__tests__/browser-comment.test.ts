import { describe, expect, it } from "vitest";

import { buildBrowserAnnotationViewportBridgeScript } from "../src/main/annotation-viewport-bridge";
import { serializeBrowserComment } from "../src/renderer/browser-comment";

describe("browser comment serialization", () => {
  it("escapes page-derived data", () => {
    const serialized = serializeBrowserComment({
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
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("<button onclick");
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
