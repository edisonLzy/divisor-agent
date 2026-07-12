import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { app } from "electron";

import type {
  BrowserReadingAnnotation,
  BrowserReadingNote,
  BrowserReadingTag,
} from "../common/types";
import { NoteBeamSync } from "./note-beam-sync";

interface PersistedReadingAnnotations {
  annotations: BrowserReadingAnnotation[];
}

/**
 * Local-first persistence for reading annotations.
 *
 * The records preserve the same highlight/range/note contract used by
 * NoteBeam's `/v1/note-beam/*` API. Keeping a durable local copy means a
 * failed or unavailable cloud sync never makes a user's notes disappear.
 */
export class ReadingAnnotationStore {
  private annotations = new Map<string, BrowserReadingAnnotation>();
  private sync = new NoteBeamSync();

  constructor(private path = join(app.getPath("userData"), "browser-reading-annotations.json")) {
    this.load();
  }

  create(input: BrowserReadingAnnotation) {
    const annotation = normalizeAnnotation(input);
    this.annotations.set(annotation.id, annotation);
    this.persist();
    void this.sync.create(annotation).catch((error) => this.logSyncError("create", error));
    return copy(annotation);
  }

  delete(id: string) {
    const annotation = this.annotations.get(id);
    this.annotations.delete(id);
    this.persist();
    if (annotation)
      void this.sync.delete(annotation).catch((error) => this.logSyncError("delete", error));
  }

  list(url: string) {
    return [...this.annotations.values()]
      .filter((annotation) => annotation.url === url)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(copy);
  }

  update(input: { id: string; note?: Partial<BrowserReadingNote>; tag?: BrowserReadingTag }) {
    const current = this.annotations.get(input.id);
    if (!current) throw new Error("Reading annotation not found");

    const updated: BrowserReadingAnnotation = {
      ...current,
      note: input.note
        ? {
            ...current.note,
            ...input.note,
            content: input.note.content?.slice(0, 8_000) ?? current.note.content,
            updatedAt: new Date().toISOString(),
          }
        : current.note,
      tag: input.tag ? normalizeTag(input.tag) : current.tag,
      updatedAt: new Date().toISOString(),
    };
    this.annotations.set(updated.id, updated);
    this.persist();
    void this.sync.update(updated).catch((error) => this.logSyncError("update", error));
    return copy(updated);
  }

  private logSyncError(operation: "create" | "delete" | "update", error: unknown) {
    if (!this.sync.enabled) return;
    console.warn(
      `[browser-reading-annotations] NoteBeam ${operation} sync failed:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  private load() {
    try {
      const persisted = JSON.parse(readFileSync(this.path, "utf8")) as PersistedReadingAnnotations;
      for (const annotation of persisted.annotations ?? []) {
        const normalized = normalizeAnnotation(annotation);
        this.annotations.set(normalized.id, normalized);
      }
    } catch {
      // First run and malformed local data both start with an empty library.
    }
  }

  private persist() {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify({ annotations: [...this.annotations.values()] }));
      renameSync(temporaryPath, this.path);
    } catch {
      // Annotation persistence should not make page reading fail.
    }
  }
}

function copy(annotation: BrowserReadingAnnotation): BrowserReadingAnnotation {
  return {
    ...annotation,
    note: { ...annotation.note },
    range: { ...annotation.range },
    tag: { ...annotation.tag },
  };
}

function normalizeAnnotation(input: BrowserReadingAnnotation): BrowserReadingAnnotation {
  const now = new Date().toISOString();
  if (!input.id || !input.url || !input.text.trim()) {
    throw new Error("A reading annotation requires an id, URL, and selected text");
  }
  if (!input.range?.start || !input.range?.end) {
    throw new Error("A reading annotation requires a serialized text range");
  }
  return {
    ...input,
    createdAt: input.createdAt || now,
    note: {
      content: input.note?.content?.slice(0, 8_000) ?? "",
      createdAt: input.note?.createdAt || now,
      id: input.note?.id || input.id,
      updatedAt: input.note?.updatedAt || now,
    },
    range: {
      end: input.range.end,
      endOffset: Math.max(0, input.range.endOffset),
      start: input.range.start,
      startOffset: Math.max(0, input.range.startOffset),
    },
    sentence: input.sentence?.slice(0, 1_000) ?? null,
    tag: normalizeTag(input.tag),
    text: input.text.trim().slice(0, 2_000),
    updatedAt: input.updatedAt || now,
    url: input.url,
  };
}

function normalizeTag(tag: BrowserReadingTag): BrowserReadingTag {
  if (!tag?.id || !tag.name || !tag.color) throw new Error("A reading annotation requires a tag");
  return {
    color: tag.color.slice(0, 32),
    displayLabel: tag.displayLabel?.slice(0, 40) ?? null,
    group: tag.group === "english" ? "english" : "general",
    id: tag.id.slice(0, 120),
    name: tag.name.slice(0, 80),
  };
}
