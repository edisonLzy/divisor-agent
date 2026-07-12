import { describe, expect, it } from "vitest";

import {
  insertBrowserReadingAnnotation,
  serializeBrowserReadingAnnotation,
} from "../src/renderer/browser-reading-annotation";

describe("browser reading annotation prompt context", () => {
  it("serializes selected text, note, and instruction without exposing markup", () => {
    const serialized = serializeBrowserReadingAnnotation({
      annotation: annotation(),
      instruction: "Explain <this> & give an example",
    });

    expect(serialized).toContain("Explain &lt;this&gt; &amp; give an example");
    expect(serialized).toContain("Harness engineering");
    expect(serialized).not.toContain("<unsafe>");
  });

  it("inserts a self-contained reading context node into the prompt", () => {
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

    insertBrowserReadingAnnotation(editor, annotation(), "Explain this selection");

    expect(calls).toEqual([
      "focus",
      {
        attrs: { annotation: annotation(), instruction: "Explain this selection" },
        type: "browserReadingAnnotation",
      },
      " ",
      "run",
    ]);
  });
});

function annotation() {
  return {
    createdAt: "2026-07-12T00:00:00.000Z",
    id: "annotation-1",
    note: {
      content: "Connects environment design to agent capability.",
      createdAt: "2026-07-12T00:00:00.000Z",
      id: "note-1",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
    range: {
      end: "./p[1]/text()[1]",
      endOffset: 18,
      start: "./p[1]/text()[1]",
      startOffset: 0,
    },
    sentence: "Harness engineering is a system design practice.",
    tag: {
      color: "#F44336",
      displayLabel: "重点",
      group: "general" as const,
      id: "important",
      name: "Important",
    },
    text: "Harness engineering <unsafe>",
    updatedAt: "2026-07-12T00:00:00.000Z",
    url: "https://example.com/article",
  };
}
