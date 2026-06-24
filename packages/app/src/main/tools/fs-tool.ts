import { readFile, writeFile } from "node:fs/promises";

import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type { AppTool } from "./types.js";

const PathParams = Type.Object({
  path: Type.String({ description: "Absolute path to the file to read" }),
});

const WriteParams = Type.Object({
  path: Type.String({ description: "Absolute path to the file to write" }),
  content: Type.String({ description: "Content to write to the file" }),
});

export const fsReadTextFileTool: AppTool<typeof PathParams> = {
  name: "fs/read_text_file",
  label: "Read File",
  description: "Read the contents of a text file from the local filesystem",
  riskLevel: "medium",
  parameters: PathParams,
  async execute(toolCallId, params) {
    const { path } = params as Static<typeof PathParams>;

    try {
      const content = await readFile(path, "utf-8");
      return {
        content: [{ type: "text", text: content }],
        details: { toolCallId, bytesRead: content.length },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};

export const fsWriteTextFileTool: AppTool<typeof WriteParams> = {
  name: "fs/write_text_file",
  label: "Write File",
  description: "Write content to a text file on the local filesystem",
  riskLevel: "high",
  parameters: WriteParams,
  async execute(toolCallId, params) {
    const { path, content } = params as Static<typeof WriteParams>;

    try {
      await writeFile(path, content, "utf-8");
      return {
        content: [{ type: "text", text: `File written successfully: ${path}` }],
        details: { toolCallId, bytesWritten: content.length },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};
