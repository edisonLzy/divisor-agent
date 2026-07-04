export interface FileEntry {
  bytes?: number;
  comments?: FileComment[];
  content?: string;
  endLine?: number;
  error?: string;
  fetchedAt?: number;
  focusCommentId?: string;
  focusCommentRequestId?: number;
  highlightExpiresAt?: number;
  highlightRequestId?: number;
  language?: string;
  line?: number;
  path: string;
}

export interface FileComment {
  body: string;
  createdAt: number;
  id: string;
  range: FileCommentRange;
  updatedAt?: number;
}

export interface FileCommentRange {
  endColumn: number;
  endLine: number;
  selectedText: string;
  startColumn: number;
  startLine: number;
}

export interface FilesArtifactContent {
  activePath: string | null;
  files: FileEntry[];
}

export const EMPTY_FILES_CONTENT: FilesArtifactContent = {
  activePath: null,
  files: [],
};
