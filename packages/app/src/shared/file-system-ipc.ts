export interface FileSystemIPC {
  /**
   * Read a UTF-8 text file from the local filesystem. Used by the
   * `extension-files` package to lazy-load file contents when the user
   * clicks a `file://` link in an assistant message.
   *
   * Returns either the file content and byte count, or a string error
   * message describing why the read failed (e.g. ENOENT, EACCES).
   */
  fsReadTextFile(path: string): Promise<{ content: string; bytes: number } | { error: string }>;
}
