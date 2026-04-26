import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// ── Import after mock registration ───────────────────────────────────────────

import { readFile, writeFile } from "node:fs/promises";

import { fsReadTextFileTool, fsWriteTextFileTool } from "../../../src/main/tools/fs-tool.js";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("fs-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fsReadTextFileTool", () => {
    it("reads file content successfully", async () => {
      vi.mocked(readFile).mockResolvedValue("Hello, World!");

      const result = await fsReadTextFileTool.execute("call-123", { path: "/tmp/test.txt" });

      expect(readFile).toHaveBeenCalledWith("/tmp/test.txt", "utf-8");
      expect(result).toEqual({
        content: [{ type: "text", text: "Hello, World!" }],
        details: { toolCallId: "call-123", bytesRead: 13 },
      });
    });

    it("returns error when file does not exist", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const result = await fsReadTextFileTool.execute("call-456", {
        path: "/nonexistent/file.txt",
      });

      expect(result.content[0].text).toContain("ENOENT");
      expect(result.details.toolCallId).toBe("call-456");
    });

    it("returns error when read fails with other error", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("Permission denied"));

      const result = await fsReadTextFileTool.execute("call-789", { path: "/protected/file.txt" });

      expect(result.content[0].text).toContain("Permission denied");
    });
  });

  describe("fsWriteTextFileTool", () => {
    it("writes content successfully", async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await fsWriteTextFileTool.execute("call-123", {
        path: "/tmp/output.txt",
        content: "Test content",
      });

      expect(writeFile).toHaveBeenCalledWith("/tmp/output.txt", "Test content", "utf-8");
      expect(result).toEqual({
        content: [{ type: "text", text: "File written successfully: /tmp/output.txt" }],
        details: { toolCallId: "call-123", bytesWritten: 12 },
      });
    });

    it("returns error when write fails", async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error("ENOSPC: no space left on device"));

      const result = await fsWriteTextFileTool.execute("call-456", {
        path: "/full/disk.txt",
        content: "Some content",
      });

      expect(result.content[0].text).toContain("ENOSPC");
      expect(result.details.toolCallId).toBe("call-456");
    });

    it("reports correct bytesWritten", async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const result = await fsWriteTextFileTool.execute("call-789", {
        path: "/tmp/small.txt",
        content: "Hi",
      });

      expect(result.details.bytesWritten).toBe(2);
    });
  });
});
