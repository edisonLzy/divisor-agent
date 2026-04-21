import { Type } from '@mariozechner/pi-ai';
import type { Static } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';

const PathParams = Type.Object({
  path: Type.String({ description: 'Absolute path to the file to read' }),
});

const WriteParams = Type.Object({
  path: Type.String({ description: 'Absolute path to the file to write' }),
  content: Type.String({ description: 'Content to write to the file' }),
});

export const fsReadTextFileTool: AgentTool<typeof PathParams> = {
  name: 'fs/read_text_file',
  label: 'Read File',
  description: 'Read the contents of a text file from the local filesystem',
  parameters: PathParams,
  async execute(toolCallId, params) {
    const { path } = params as Static<typeof PathParams>;

    try {
      const file = Bun.file(path);
      if (!file.exists()) {
        return {
          content: [{ type: 'text', text: `Error: File not found: ${path}` }],
          details: { toolCallId },
        };
      }
      const content = await file.text();
      return {
        content: [{ type: 'text', text: content }],
        details: { toolCallId, bytesRead: content.length },
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};

export const fsWriteTextFileTool: AgentTool<typeof WriteParams> = {
  name: 'fs/write_text_file',
  label: 'Write File',
  description: 'Write content to a text file on the local filesystem',
  parameters: WriteParams,
  async execute(toolCallId, params) {
    const { path, content } = params as Static<typeof WriteParams>;

    try {
      await Bun.write(path, content);
      return {
        content: [{ type: 'text', text: `File written successfully: ${path}` }],
        details: { toolCallId, bytesWritten: content.length },
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};
