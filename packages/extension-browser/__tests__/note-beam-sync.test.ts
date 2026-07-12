import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoteBeamSync } from "../src/main/note-beam-sync";

const originalBaseUrl = process.env.NOTE_BEAM_API_BASE_URL;
const originalToken = process.env.NOTE_BEAM_ACCESS_TOKEN;

beforeEach(() => {
  process.env.NOTE_BEAM_API_BASE_URL = "https://codemo.asia";
  process.env.NOTE_BEAM_ACCESS_TOKEN = "test-token";
});

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.NOTE_BEAM_API_BASE_URL;
  else process.env.NOTE_BEAM_API_BASE_URL = originalBaseUrl;
  if (originalToken === undefined) delete process.env.NOTE_BEAM_ACCESS_TOKEN;
  else process.env.NOTE_BEAM_ACCESS_TOKEN = originalToken;
  vi.unstubAllGlobals();
});

describe("NoteBeamSync", () => {
  it("uses the existing NoteBeam tag, note, and highlight endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([{ id: "remote-important", name: "Important" }]))
      .mockResolvedValueOnce(response({ id: "note-1" }))
      .mockResolvedValueOnce(response({ id: "annotation-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await new NoteBeamSync().create(annotation());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://codemo.asia/v1/note-beam/tags?includeDefaults=true",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://codemo.asia/v1/note-beam/note",
      expect.objectContaining({ body: expect.stringContaining('"id":"note-1"'), method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://codemo.asia/v1/note-beam/highlight",
      expect.objectContaining({
        body: expect.stringContaining('"tagId":"remote-important"'),
        method: "POST",
      }),
    );
  });

  it("does not send user content without explicit NoteBeam credentials", async () => {
    delete process.env.NOTE_BEAM_API_BASE_URL;
    delete process.env.NOTE_BEAM_ACCESS_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sync = new NoteBeamSync();
    await sync.create(annotation());

    expect(sync.enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function response(data: unknown) {
  return { json: vi.fn().mockResolvedValue({ code: 0, data }), ok: true };
}

function annotation() {
  return {
    createdAt: "2026-07-12T00:00:00.000Z",
    id: "annotation-1",
    note: {
      content: "This is my note.",
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
    text: "Harness engineering",
    updatedAt: "2026-07-12T00:00:00.000Z",
    url: "https://example.com/article",
  };
}
