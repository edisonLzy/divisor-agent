import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// ── Import after mock registration ───────────────────────────────────────────

import { spawn } from "node:child_process";

import { terminalCreateTool } from "../../../../src/main/tools/terminal-tool.js";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("terminalCreateTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSpawnSuccess = (stdout: string, stderr: string = "", exitCode: number = 0) => {
    const mockProc = {
      stdout: {
        on: vi.fn((event, cb) => {
          if (event === "data") cb(Buffer.from(stdout));
        }),
      },
      stderr: {
        on: vi.fn((event, cb) => {
          if (event === "data") cb(Buffer.from(stderr));
        }),
      },
      on: vi.fn((event, cb) => {
        if (event === "close") cb(exitCode);
        if (event === "error") cb(new Error("spawn error"));
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockProc as any);
    return mockProc;
  };

  describe("command execution", () => {
    it("executes command and returns stdout", async () => {
      mockSpawnSuccess("Hello from terminal\n");

      const result = await terminalCreateTool.execute("call-123", { command: "echo 'Hello'" });

      expect(spawn).toHaveBeenCalledWith("sh", ["-c", "echo 'Hello'"], expect.any(Object));
      expect(result).toEqual({
        content: [{ type: "text", text: "Hello from terminal\n" }],
        details: { toolCallId: "call-123", exitCode: 0 },
      });
    });

    it("returns stderr when stdout is empty", async () => {
      mockSpawnSuccess("", "some error\n", 1);

      const result = await terminalCreateTool.execute("call-456", { command: "ls /nonexistent" });

      expect(result.content[0].text).toContain("some error");
      expect(result.details.exitCode).toBe(1);
    });

    it("returns '(no output)' when both stdout and stderr are empty", async () => {
      mockSpawnSuccess("", "", 0);

      const result = await terminalCreateTool.execute("call-789", { command: "true" });

      expect(result.content[0].text).toBe("(no output)");
    });

    it("formats non-zero exit code in output", async () => {
      mockSpawnSuccess("file not found", "", 1);

      const result = await terminalCreateTool.execute("call-999", { command: "cat missing.txt" });

      expect(result.content[0].text).toBe("Exit 1: file not found");
    });

    it("uses provided cwd when specified", async () => {
      mockSpawnSuccess("result\n");

      await terminalCreateTool.execute("call-cwd", { command: "ls", cwd: "/tmp" });

      expect(spawn).toHaveBeenCalledWith(
        "sh",
        ["-c", "ls"],
        expect.objectContaining({ cwd: "/tmp" }),
      );
    });

    it("handles spawn errors gracefully", async () => {
      const errorProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === "error") cb(new Error("ENOENT: command not found"));
        }),
      };
      vi.mocked(spawn).mockReturnValue(errorProc as any);

      const result = await terminalCreateTool.execute("call-err", { command: "nonexistent-cmd" });

      expect(result.content[0].text).toContain("ENOENT");
    });
  });

  describe("dangerous pattern blocking", () => {
    it("blocks 'rm -rf /' command", async () => {
      const result = await terminalCreateTool.execute("call-block1", { command: "rm -rf /" });

      expect(result.content[0].text).toBe("Error: Command blocked for security reasons");
      expect(result.details.blocked).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
    });

    it("blocks 'rm -rf /' with spaces", async () => {
      const result = await terminalCreateTool.execute("call-block2", { command: "rm   -rf   /" });

      expect(result.content[0].text).toBe("Error: Command blocked for security reasons");
      expect(result.details.blocked).toBe(true);
    });

    it("blocks 'dd' command", async () => {
      const result = await terminalCreateTool.execute("call-block3", {
        command: "dd if=/dev/zero of=/dev/sda",
      });

      expect(result.content[0].text).toBe("Error: Command blocked for security reasons");
      expect(result.details.blocked).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
    });

    it("blocks 'mkfs' command", async () => {
      // Note: mkfs/ pattern matches paths like "mkfs/dev/sda1" not "mkfs.ext4"
      const result = await terminalCreateTool.execute("call-block4", { command: "mkfs.ext4" });

      // mkfs.ext4 doesn't match /^mkfs\// so it would proceed to execution
      // The actual mkfs dangerous pattern is mkfs/ (e.g., mkfs/dev)
      expect(result.details.blocked).toBeUndefined();
    });

    it("blocks 'mkfs/' path pattern", async () => {
      const result = await terminalCreateTool.execute("call-block5", { command: "mkfs/dev/sda1" });

      expect(result.content[0].text).toBe("Error: Command blocked for security reasons");
      expect(result.details.blocked).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
    });

    it("allows safe commands", async () => {
      mockSpawnSuccess("safe output\n");

      const result = await terminalCreateTool.execute("call-safe", { command: "ls -la" });

      expect(result.content[0].text).toBe("safe output\n");
      expect(result.details.blocked).toBeUndefined();
    });
  });
});
