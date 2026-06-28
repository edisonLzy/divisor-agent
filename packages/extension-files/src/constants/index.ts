/**
 * Centralized constants for the `files` extension.
 *
 * Anything that would otherwise be hard-coded as a literal across multiple
 * files (extension id, artifact metadata, URL scheme, CSS hooks, IPC channel
 * names, system prompt text, …) lives here. Keeping them in one place makes
 * it cheap to rename a scheme, restyle a highlight class, or tweak the
 * prompt text without grepping the whole package.
 *
 * Per CLAUDE.md: "explicit hardcoded + docs beats clever abstraction".
 * This file deliberately uses simple `export const` literals — no factories.
 */

// --- Extension metadata ----------------------------------------------------

/** Extension id, shared by the main and renderer definitions. */
export const EXTENSION_ID = "files";

/** Human-readable extension name (shown in UI, artifact panel title, etc.). */
export const EXTENSION_NAME = "Files";

// --- Artifact registry -----------------------------------------------------

/** Artifact type registered with the extension registry. */
export const FILES_ARTIFACT_TYPE = "files";

/** Singleton artifact id (one files artifact per session). */
export const FILES_ARTIFACT_ID = "files";

/** Display label used as the `name` field on the artifact record. */
export const FILES_ARTIFACT_NAME = EXTENSION_NAME;

// --- URL scheme for assistant file links -----------------------------------

/**
 * Custom URL scheme used in assistant markdown links.
 *
 *   extension-file://<path>            (no line number)
 *   extension-file://<path>:<line>     (1-indexed start line)
 *   extension-file://<path>:<start>-<end>  (line range, inclusive)
 */
export const FILE_HREF_SCHEME = "extension-file";
export const FILE_HREF_PROTOCOL = `${FILE_HREF_SCHEME}:`;
export const FILE_HREF_PREFIX = `${FILE_HREF_SCHEME}://`;

// --- DOM / styling hooks ---------------------------------------------------

/** Data attribute used to mark intercepted anchors in the renderer. */
export const FILE_HREF_DATA_ATTR = "data-file-href";

/** CSS class applied to highlighted lines in the CodeMirror viewer. */
export const HIGHLIGHT_DECORATION_CLASS = "cm-file-highlight";

// --- IPC channels (renderer → main) ----------------------------------------

/** electronAPI.invoke channel for reading a text file from disk. */
export const FS_READ_TEXT_FILE_CHANNEL = "fsReadTextFile";

// --- System prompt ---------------------------------------------------------

/** Stable id registered with `ctx.systemPrompt.register`. */
export const FILES_SYSTEM_PROMPT_ID = "files.prompt";

/**
 * Instructs the model how to emit links that the UI can intercept and open
 * in the files artifact panel. Keep the example in sync with
 * `FILE_HREF_SCHEME` above.
 */
export const FILES_SYSTEM_PROMPT_CONTENT = `When you reference a specific file location in your answer, emit a standard markdown link of the form

[short label or "filename:line"](${FILE_HREF_PREFIX}<absolute-or-workspace-relative-path>:<line>)

or, for a line range:

[short label](${FILE_HREF_PREFIX}<path>:<startLine>-<endLine>)

Example:
逻辑在 [artifact-slice.ts:85](${FILE_HREF_PREFIX}packages/app/src/renderer/store/main/artifact-slice.ts:85) 这里。

This lets the UI open the file in the right-hand artifact panel, switch to the file tab, and scroll to the line. Do not invent file paths; only link paths you have actually read or that exist in the workspace.`;
