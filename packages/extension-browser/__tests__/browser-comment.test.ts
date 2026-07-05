import { describe, expect, it } from "vitest";

import { serializeBrowserComment } from "../src/renderer/browser-comment";

describe("browser comment serialization", () => {
  it("escapes page-derived data and references the screenshot path", () => {
    const serialized = serializeBrowserComment({
      comment: "Fix <this> & review",
      context: {
        accessibility: { name: 'Danger "button"', role: "button" },
        ancestorPath: ["main"],
        computedStyles: {},
        fullPath: "main > button",
        html: "<button onclick=evil()>Go</button>",
        nearbyText: ["Nearby <script>"],
        rect: { height: 20, width: 30, x: 1, y: 2 },
        screenshotPath: "/tmp/selection.png",
        selector: 'button[title="x"]',
        tagName: "button",
        text: "Go & win",
        title: "Unsafe <title>",
        url: "https://example.com/?a=1&b=2",
      },
    });

    expect(serialized).toContain("&lt;this&gt; &amp; review");
    expect(serialized).toContain("/tmp/selection.png");
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("<button onclick");
  });
});
