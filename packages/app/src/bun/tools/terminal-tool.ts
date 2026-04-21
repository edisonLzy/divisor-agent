import { Type } from '@mariozechner/pi-ai';
import type { Static } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';

const TerminalParams = Type.Object({
  command: Type.String({ description: 'The shell command to execute' }),
  cwd: Type.Optional(Type.String({ description: 'Working directory for the command' })),
});

const DANGEROUS_PATTERNS = [/^rm\s+-rf\s+\//, /^dd\s+/, /^mkfs\//];

export const terminalCreateTool: AgentTool<typeof TerminalParams> = {
  name: 'terminal/create',
  label: 'Run Terminal Command',
  description: 'Execute a shell command in the local terminal',
  parameters: TerminalParams,
  async execute(toolCallId, params) {
    const { command, cwd } = params as Static<typeof TerminalParams>;

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          content: [{ type: 'text', text: 'Error: Command blocked for security reasons' }],
          details: { toolCallId, blocked: true },
        };
      }
    }

    try {
      const proc = Bun.spawn(['sh', '-c', command], {
        cwd: cwd ?? process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = proc.exitCode ?? undefined;
      const output = stdout || stderr || '(no output)';

      return {
        content: [{ type: 'text', text: exitCode === 0 ? output : `Exit ${exitCode}: ${output}` }],
        details: { toolCallId, exitCode },
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};
