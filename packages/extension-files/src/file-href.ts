/**
 * Helpers for working with `file://` links in assistant messages.
 *
 * Format:
 *   file://<path>            (no line number)
 *   file://<path>:<line>     (1-indexed start line)
 *   file://<path>:<start>-<end>  (line range, inclusive)
 *
 * `<path>` may be relative (resolved against the workspace) or absolute
 * (starting with `/`). URL-encoded characters are decoded.
 */

/** Artifact type registered with the extension registry. */
export const FILES_ARTIFACT_TYPE = "files";

/** Singleton artifact id (one files artifact per session). */
export const FILES_ARTIFACT_ID = "files";

export interface ParsedFileHref {
  endLine?: number;
  line?: number;
  path: string;
}

const FILE_PREFIX = "file://";

/** Cross-platform basename: `a/b/c.ts` → `c.ts`, `/abs/foo.txt` → `foo.txt`. */
export function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

export function parseFileHref(href: string): ParsedFileHref | null {
  if (!href.startsWith(FILE_PREFIX)) return null;

  const body = href.slice(FILE_PREFIX.length);
  if (!body) return null;

  // Match: <path>(:line)?(-line)?
  // - The `:` and the line specifier are optional.
  // - The path itself may legally contain `:` (e.g. Windows `C:\...`), but
  //   we accept the last `:digits` segment only — this matches what an
  //   LLM would emit for a Unix-style relative path.
  const match = body.match(/^(.*?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return null;

  const [, rawPath, startStr, endStr] = match;
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    path = rawPath;
  }
  if (!path) return null;

  return {
    path,
    line: startStr ? Number(startStr) : undefined,
    endLine: endStr ? Number(endStr) : undefined,
  };
}
