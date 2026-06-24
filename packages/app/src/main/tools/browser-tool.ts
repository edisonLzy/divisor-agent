import { randomUUID } from "node:crypto";

import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type { AppTool } from "./types.js";

const BrowserOpenParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable artifact id to reuse" })),
  title: Type.Optional(Type.String({ description: "Short browser artifact tab label" })),
  url: Type.String({ description: "The local or public URL to open in a browser artifact" }),
});

export const browserOpenTool: AppTool<typeof BrowserOpenParams> = {
  name: "browser/open",
  label: "Open Browser Artifact",
  description: "Open a local or public URL as a browser artifact for visual review and annotation.",
  riskLevel: "safe",
  parameters: BrowserOpenParams,
  async execute(toolCallId, params) {
    const { artifactId, title, url } = params as Static<typeof BrowserOpenParams>;
    const id = artifactId?.trim() || `browser-${randomUUID()}`;
    const name = title?.trim() || getBrowserArtifactName(url);

    return {
      content: [{ type: "text", text: `Opened browser artifact: ${url}` }],
      details: {
        artifacts: [
          {
            content: { title: name, url },
            id,
            name,
            type: "browser",
          },
        ],
        toolCallId,
      },
    };
  },
};

function getBrowserArtifactName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.host || parsed.pathname || "Browser";
  } catch {
    return url.replace(/^https?:\/\//, "").slice(0, 32) || "Browser";
  }
}
