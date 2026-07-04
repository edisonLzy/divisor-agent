import { useExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";
import { useEffect, useMemo } from "react";

import {
  FILES_ARTIFACT_ID,
  FILES_ARTIFACT_NAME,
  FILES_ARTIFACT_TYPE,
  FS_READ_TEXT_FILE_CHANNEL,
} from "../../common/constants";
import { getFileBaseName } from "../../common/helper";
import { syncPromptFileComments } from "../file-comment-extension";
import { updateFileEntry } from "./artifact-state";
import { CodeBlockEditor } from "./code-block-editor";
import { FilesTabBar } from "./files-tab-bar";
import { languageFromPath } from "./language-from-path";
import type { FileComment, FilesArtifactContent } from "./types";

interface FilesArtifactProps {
  artifactId: string;
  content: FilesArtifactContent;
  sessionId: string;
}

function getElectronAPI() {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api) {
    throw new Error(
      "window.electronAPI is not available; files extension must run in Electron renderer",
    );
  }
  return api;
}

export function FilesArtifact({ content, sessionId }: FilesArtifactProps) {
  const api = useExtensionsContextAPI();

  const files = content.files;
  const active = useMemo(
    () => files.find((f) => f.path === content.activePath) ?? null,
    [files, content.activePath],
  );

  // Lazy-load file content when the active entry doesn't have it yet.
  useEffect(() => {
    if (!active) return;
    if (active.content !== undefined || active.error !== undefined) return;

    let cancelled = false;
    getElectronAPI()
      .invoke(FS_READ_TEXT_FILE_CHANNEL, active.path)
      .then((result) => {
        if (cancelled) return;
        if (result && typeof result === "object" && "error" in result) {
          updateFileEntry(api, sessionId, active.path, content, {
            error: String((result as { error: unknown }).error),
          });
        } else if (result && typeof result === "object" && "content" in result) {
          const { content: text, bytes } = result as { content: string; bytes: number };
          updateFileEntry(api, sessionId, active.path, content, {
            content: text,
            bytes,
            language: languageFromPath(active.path),
            fetchedAt: Date.now(),
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        updateFileEntry(api, sessionId, active.path, content, {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [active, api, sessionId, content]);

  const setActivePath = (path: string) => {
    api.upsertArtifact<FilesArtifactContent>(sessionId, {
      content: { ...content, activePath: path },
      id: FILES_ARTIFACT_ID,
      name: FILES_ARTIFACT_NAME,
      type: FILES_ARTIFACT_TYPE,
    });
  };

  const closeFile = (path: string) => {
    const nextFiles = files.filter((f) => f.path !== path);
    const nextActive =
      content.activePath === path
        ? (nextFiles[nextFiles.length - 1]?.path ?? null)
        : content.activePath;
    api.upsertArtifact<FilesArtifactContent>(sessionId, {
      content: { activePath: nextActive, files: nextFiles },
      id: FILES_ARTIFACT_ID,
      name: FILES_ARTIFACT_NAME,
      type: FILES_ARTIFACT_TYPE,
    });
  };

  const updateActiveComments = (comments: FileComment[]) => {
    if (!active) return;
    const latest = api.getArtifact<FilesArtifactContent>(sessionId, FILES_ARTIFACT_ID);
    const current = latest?.content ?? content;
    const previousComments =
      current.files.find((file) => file.path === active.path)?.comments ?? active.comments ?? [];

    syncPromptFileComments(api.sharedPromptEditor.editor, active.path, previousComments, comments);
    updateFileEntry(api, sessionId, active.path, content, { comments });
  };

  if (files.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">No files open</div>
          <p className="mt-1 text-xs">
            Click an <code className="rounded bg-muted px-1 py-0.5">extension-file://</code> link in
            the chat to preview a file here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <FilesTabBar
        activePath={content.activePath}
        files={files.map((f) => ({ label: getFileBaseName(f.path), path: f.path }))}
        onActivate={setActivePath}
        onClose={closeFile}
      />
      {active ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeBlockEditor
            code={active.content ?? ""}
            comments={active.comments ?? []}
            endLine={active.endLine}
            error={active.error}
            filePath={active.path}
            focusCommentId={active.focusCommentId}
            focusCommentRequestId={active.focusCommentRequestId}
            highlightExpiresAt={active.highlightExpiresAt}
            highlightRequestId={active.highlightRequestId}
            highlightLine={active.line}
            language={active.language ?? languageFromPath(active.path)}
            onCommentsChange={updateActiveComments}
          />
        </div>
      ) : null}
    </div>
  );
}
