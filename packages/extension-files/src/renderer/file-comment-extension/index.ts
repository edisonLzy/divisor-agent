export { fileCommentExtension } from "./node";
export {
  createFileCommentNodeAttrs,
  FILE_COMMENT_EXTENSION_NAME,
  formatFileCommentRange,
  getFileCommentPreview,
  serializeFileCommentNodeToXml,
  truncateFileCommentText,
  type FileCommentNodeAttrs,
} from "./model";
export { diffFileCommentPromptSync, syncPromptFileComments } from "./sync";
export type { FileCommentPromptSyncOp } from "./sync";
