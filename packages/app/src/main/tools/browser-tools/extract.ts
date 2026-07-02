import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const ExtractParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  instruction: Type.String({
    description:
      "Natural-language description of what to extract from the page. The LLM observes the screenshot + a11y snapshot returned alongside the tool result and produces the extract itself.",
  }),
});

export const browserExtractTool: AppTool<typeof ExtractParams> = {
  name: "browser/extract",
  label: "Extract Page Content",
  description:
    "Capture the current page (screenshot + accessibility snapshot) and return it for the calling model to interpret according to `instruction`. Useful for structured data extraction (titles, prices, headings, etc).",
  riskLevel: "safe",
  parameters: ExtractParams,
  async execute(toolCallId, params) {
    const { artifactId, instruction } = params as { artifactId?: string; instruction: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const observation = await manager.observe(resolved.sessionId, resolved.artifactId);
    return {
      content: [
        {
          text: `Extracted snapshot from ${observation.url}; calling model should interpret.`,
          type: "text",
        },
      ],
      details: {
        action: "extract",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "extract",
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        instruction,
        observation,
        toolCallId,
      },
    };
  },
};