import { useExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";
import { useEffect, useMemo, useRef } from "react";

import {
  FILES_ARTIFACT_ID,
  FILES_ARTIFACT_NAME,
  FILES_ARTIFACT_TYPE,
  FS_READ_TEXT_FILE_CHANNEL,
} from "../constants";
import { getFileBaseName, type ParsedFileHref } from "../helper";
import { CodeBlockEditor } from "./code-block-editor";
import { FilesTabBar } from "./files-tab-bar";
import { languageFromPath } from "./language-from-path";

export interface FileEntry {
  bytes?: number;
  content?: string;
  endLine?: number;
  error?: string;
  fetchedAt?: number;
  highlightExpiresAt?: number;
  highlightRequestId?: number;
  language?: string;
  line?: number;
  path: string;
}

export interface FilesArtifactContent {
  activePath: string | null;
  files: FileEntry[];
}

export const EMPTY_FILES_CONTENT: FilesArtifactContent = {
  activePath: null,
  files: [],
};

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
  const containerRef = useRef<HTMLDivElement | null>(null);

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
          updateEntry(api, sessionId, active.path, content, {
            error: String((result as { error: unknown }).error),
          });
        } else if (result && typeof result === "object" && "content" in result) {
          const { content: text, bytes } = result as { content: string; bytes: number };
          updateEntry(api, sessionId, active.path, content, {
            content: text,
            bytes,
            language: languageFromPath(active.path),
            fetchedAt: Date.now(),
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        updateEntry(api, sessionId, active.path, content, {
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
    <div ref={containerRef} className="flex h-full flex-col">
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
            endLine={active.endLine}
            error={active.error}
            highlightExpiresAt={active.highlightExpiresAt}
            highlightRequestId={active.highlightRequestId}
            highlightLine={active.line}
            language={active.language ?? languageFromPath(active.path)}
          />
        </div>
      ) : null}
    </div>
  );
}

// --- helpers used by the link renderer (renderer.tsx) -----------------------

export function addOrActivateFile(
  api: ReturnType<typeof useExtensionsContextAPI>,
  sessionId: string,
  parsed: ParsedFileHref,
): void {
  const existing = api.getArtifact<FilesArtifactContent>(sessionId, FILES_ARTIFACT_ID);
  const current: FilesArtifactContent = existing?.content ?? EMPTY_FILES_CONTENT;
  const found = current.files.find((f) => f.path === parsed.path);
  const nextHighlightRequestId =
    parsed.line !== undefined ? (found?.highlightRequestId ?? 0) + 1 : undefined;
  const highlightExpiresAt = parsed.line !== undefined ? Date.now() + 1000 : undefined;
  const newEntry: FileEntry = found
    ? {
        ...found,
        endLine: parsed.line !== undefined ? parsed.endLine : undefined,
        highlightExpiresAt,
        highlightRequestId: nextHighlightRequestId,
        line: parsed.line,
      }
    : {
        endLine: parsed.line !== undefined ? parsed.endLine : undefined,
        highlightExpiresAt,
        highlightRequestId: nextHighlightRequestId,
        line: parsed.line,
        path: parsed.path,
      };

  const nextFiles = found
    ? current.files.map((f) => (f.path === parsed.path ? newEntry : f))
    : [...current.files, newEntry];

  api.upsertArtifact<FilesArtifactContent>(sessionId, {
    content: { activePath: parsed.path, files: nextFiles },
    id: FILES_ARTIFACT_ID,
    name: FILES_ARTIFACT_NAME,
    type: FILES_ARTIFACT_TYPE,
  });
  api.openArtifact(sessionId, FILES_ARTIFACT_ID);
}

function updateEntry(
  api: ReturnType<typeof useExtensionsContextAPI>,
  sessionId: string,
  path: string,
  baseContent: FilesArtifactContent,
  patch: Partial<FileEntry>,
): void {
  const latest = api.getArtifact<FilesArtifactContent>(sessionId, FILES_ARTIFACT_ID);
  const current = latest?.content ?? baseContent;
  const nextFiles = current.files.map((f) => (f.path === path ? { ...f, ...patch } : f));
  api.upsertArtifact<FilesArtifactContent>(sessionId, {
    content: { activePath: current.activePath, files: nextFiles },
    id: FILES_ARTIFACT_ID,
    name: FILES_ARTIFACT_NAME,
    type: FILES_ARTIFACT_TYPE,
  });
}
