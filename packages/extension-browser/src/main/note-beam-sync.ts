import type { BrowserReadingAnnotation, BrowserReadingTag } from "../common/types";

/**
 * Optional cloud mirror for the existing NoteBeam API.
 *
 * The Electron app remains local-first. Deployments opt into the same backend
 * used by NoteBeam by providing both NOTE_BEAM_API_BASE_URL and
 * NOTE_BEAM_ACCESS_TOKEN to the main process. No user data is sent otherwise.
 */
export class NoteBeamSync {
  private accessToken = process.env.NOTE_BEAM_ACCESS_TOKEN;
  private baseUrl = process.env.NOTE_BEAM_API_BASE_URL?.replace(/\/$/, "");

  get enabled() {
    return Boolean(this.baseUrl && this.accessToken);
  }

  async create(annotation: BrowserReadingAnnotation) {
    if (!this.enabled) return;
    const tagId = await this.resolveTagId(annotation.tag);
    await this.request("/v1/note-beam/note", "POST", {
      content: annotation.note.content,
      id: annotation.note.id,
    });
    await this.request("/v1/note-beam/highlight", "POST", {
      id: annotation.id,
      noteId: annotation.note.id,
      range: annotation.range,
      sentence: annotation.sentence ?? undefined,
      tagId,
      text: annotation.text,
      url: annotation.url,
    });
  }

  async update(annotation: BrowserReadingAnnotation) {
    if (!this.enabled) return;
    const tagId = await this.resolveTagId(annotation.tag);
    await Promise.all([
      this.request(`/v1/note-beam/note/${annotation.note.id}`, "PATCH", {
        content: annotation.note.content,
      }),
      this.request(`/v1/note-beam/highlight/${annotation.id}`, "PATCH", { tagId }),
    ]);
  }

  async delete(annotation: BrowserReadingAnnotation) {
    if (!this.enabled) return;
    await this.request(`/v1/note-beam/highlight/${annotation.id}`, "DELETE");
    await this.request(`/v1/note-beam/note/${annotation.note.id}`, "DELETE");
  }

  private async resolveTagId(tag: BrowserReadingTag) {
    const tags = await this.request<NoteBeamTag[]>(
      "/v1/note-beam/tags?includeDefaults=true",
      "GET",
    );
    const existing = tags.find((candidate) => candidate.name === tag.name);
    if (existing) return existing.id;
    const created = await this.request<NoteBeamTag>("/v1/note-beam/tag", "POST", {
      color: tag.color,
      displayLabel: tag.displayLabel ?? undefined,
      group: tag.group,
      name: tag.name,
    });
    return created.id;
  }

  private async request<T = unknown>(
    path: string,
    method: "DELETE" | "GET" | "PATCH" | "POST",
    body?: unknown,
  ) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      method,
    });
    if (!response.ok) throw new Error(`NoteBeam API request failed (${response.status})`);
    if (method === "DELETE") return undefined as T;
    const responseBody = (await response.json()) as
      | { code?: number; data?: T; success?: boolean }
      | T;
    if (isWrappedResponse(responseBody)) return responseBody.data as T;
    return responseBody as T;
  }
}

interface NoteBeamTag {
  id: string;
  name: string;
}

function isWrappedResponse(
  value: unknown,
): value is { code?: number; data?: unknown; success?: boolean } {
  return Boolean(value && typeof value === "object" && "data" in value);
}
