import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => tmpdir()) } }));

import { ReadingAnnotationStore } from "../src/main/reading-annotation-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe("ReadingAnnotationStore", () => {
  it("persists NoteBeam-compatible text ranges, notes, and tag changes by URL", () => {
    const directory = mkdtempSync(join(tmpdir(), "divisor-reading-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "annotations.json");
    const store = new ReadingAnnotationStore(path);

    const annotation = store.create(readingAnnotation());
    expect(store.list("https://example.com/article")).toEqual([annotation]);
    expect(store.list("https://example.com/other")).toEqual([]);

    const updated = store.update({
      id: annotation.id,
      note: { content: "This connects model capability to environment design." },
      tag: {
        color: "#FF9800",
        displayLabel: "问题",
        group: "general",
        id: "question",
        name: "Question",
      },
    });

    expect(updated.note.content).toContain("environment design");
    expect(updated.tag.id).toBe("question");
    expect(JSON.parse(readFileSync(path, "utf8")).annotations).toHaveLength(1);

    store.delete(annotation.id);
    expect(store.list(annotation.url)).toEqual([]);
  });
});

function readingAnnotation() {
  return {
    createdAt: "2026-07-12T00:00:00.000Z",
    id: "annotation-1",
    note: {
      content: "",
      createdAt: "2026-07-12T00:00:00.000Z",
      id: "note-1",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
    range: {
      end: "./main[1]/p[1]/text()[1]",
      endOffset: 44,
      start: "./main[1]/p[1]/text()[1]",
      startOffset: 4,
    },
    sentence: "Harness engineering changes how an agent uses its environment.",
    tag: {
      color: "#F44336",
      displayLabel: "重点",
      group: "general" as const,
      id: "important",
      name: "Important",
    },
    text: "engineering changes how an agent",
    updatedAt: "2026-07-12T00:00:00.000Z",
    url: "https://example.com/article",
  };
}
