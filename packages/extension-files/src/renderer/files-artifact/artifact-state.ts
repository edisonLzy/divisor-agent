import type { ExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";

import {
  FILES_ARTIFACT_ID,
  FILES_ARTIFACT_NAME,
  FILES_ARTIFACT_TYPE,
} from "../../common/constants";
import type { ParsedFileHref } from "../../common/helper";
import type { FileEntry, FilesArtifactContent } from "./types";
import { EMPTY_FILES_CONTENT } from "./types";

interface ActivateFileEntryInput {
  endLine?: number;
  focusCommentId?: string;
  line?: number;
  path: string;
}

interface ActivateFileCommentInput {
  commentId: string;
  endLine?: number;
  path: string;
  startLine: number;
}

export function addOrActivateFile(
  api: ExtensionsContextAPI,
  sessionId: string,
  parsed: ParsedFileHref,
): void {
  activateFileEntry(api, sessionId, parsed);
}

export function addOrActivateFileComment(
  api: ExtensionsContextAPI,
  sessionId: string,
  input: ActivateFileCommentInput,
): void {
  activateFileEntry(api, sessionId, {
    endLine: input.endLine,
    focusCommentId: input.commentId,
    line: input.startLine,
    path: input.path,
  });
}

export function updateFileEntry(
  api: ExtensionsContextAPI,
  sessionId: string,
  path: string,
  baseContent: FilesArtifactContent,
  patch: Partial<FileEntry>,
): void {
  const latest = api.getArtifact<FilesArtifactContent>(sessionId, FILES_ARTIFACT_ID);
  const current = latest?.content ?? baseContent;
  const nextFiles = current.files.map((file) =>
    file.path === path ? { ...file, ...patch } : file,
  );
  api.upsertArtifact<FilesArtifactContent>(sessionId, {
    content: { activePath: current.activePath, files: nextFiles },
    id: FILES_ARTIFACT_ID,
    name: FILES_ARTIFACT_NAME,
    type: FILES_ARTIFACT_TYPE,
  });
}

function activateFileEntry(
  api: ExtensionsContextAPI,
  sessionId: string,
  input: ActivateFileEntryInput,
): void {
  const existing = api.getArtifact<FilesArtifactContent>(sessionId, FILES_ARTIFACT_ID);
  const current: FilesArtifactContent = existing?.content ?? EMPTY_FILES_CONTENT;
  const found = current.files.find((file) => file.path === input.path);
  const nextHighlightRequestId =
    input.line !== undefined ? (found?.highlightRequestId ?? 0) + 1 : undefined;
  const nextFocusCommentRequestId =
    input.focusCommentId !== undefined ? (found?.focusCommentRequestId ?? 0) + 1 : undefined;
  const highlightExpiresAt = input.line !== undefined ? Date.now() + 1000 : undefined;
  const nextEntry: FileEntry = found
    ? {
        ...found,
        endLine: input.line !== undefined ? input.endLine : undefined,
        focusCommentId: input.focusCommentId,
        focusCommentRequestId: nextFocusCommentRequestId,
        highlightExpiresAt,
        highlightRequestId: nextHighlightRequestId,
        line: input.line,
      }
    : {
        endLine: input.line !== undefined ? input.endLine : undefined,
        focusCommentId: input.focusCommentId,
        focusCommentRequestId: nextFocusCommentRequestId,
        highlightExpiresAt,
        highlightRequestId: nextHighlightRequestId,
        line: input.line,
        path: input.path,
      };

  const nextFiles = found
    ? current.files.map((file) => (file.path === input.path ? nextEntry : file))
    : [...current.files, nextEntry];

  api.upsertArtifact<FilesArtifactContent>(sessionId, {
    content: { activePath: input.path, files: nextFiles },
    id: FILES_ARTIFACT_ID,
    name: FILES_ARTIFACT_NAME,
    type: FILES_ARTIFACT_TYPE,
  });
  api.openArtifact(sessionId, FILES_ARTIFACT_ID);
}
