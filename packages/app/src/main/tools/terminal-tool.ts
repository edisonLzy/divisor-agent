import { spawn } from "node:child_process";

import { Type } from "@mariozechner/pi-ai";
import type { Static } from "@sinclair/typebox";

import type { AppTool } from "./types.js";

const TerminalParams = Type.Object({
  command: Type.String({ description: "The shell command to execute" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the command" })),
});

const DANGEROUS_PATTERNS = [/^rm\s+-rf\s+\//, /^dd\s+/, /^mkfs\//];

export const terminalCreateTool: AppTool<typeof TerminalParams> = {
  name: "terminal/create",
  label: "Run Terminal Command",
  description: "Execute a shell command in the local terminal",
  riskLevel: "high",
  parameters: TerminalParams,
  async execute(toolCallId, params) {
    const { command, cwd } = params as Static<typeof TerminalParams>;

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          content: [{ type: "text", text: "Error: Command blocked for security reasons" }],
          details: { toolCallId, blocked: true },
        };
      }
    }

    try {
      const [stdout, stderr, exitCode] = await new Promise<[string, string, number]>(
        (resolve, reject) => {
          const proc = spawn("sh", ["-c", command], {
            cwd: cwd ?? process.cwd(),
          });

          let out = "";
          let err = "";

          proc.stdout.on("data", (chunk: Buffer) => {
            out += chunk.toString();
          });
          proc.stderr.on("data", (chunk: Buffer) => {
            err += chunk.toString();
          });

          proc.on("close", (code) => resolve([out, err, code ?? 0]));
          proc.on("error", reject);
        },
      );

      const output = stdout || stderr || "(no output)";

      return {
        content: [{ type: "text", text: exitCode === 0 ? output : `Exit ${exitCode}: ${output}` }],
        details: { toolCallId, exitCode },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};
