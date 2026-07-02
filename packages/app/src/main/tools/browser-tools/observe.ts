import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const ObserveParams = Type.Object({
  artifactId: Type.Optional(
    Type.String({
      description:
        "Stable browser artifact id (from a prior browser/open call). Defaults to the most recent browser artifact.",
    }),
  ),
  maxRefs: Type.Optional(
    Type.Number({
      description: "Cap the number of refs returned (default 32).",
    }),
  ),
  selector: Type.Optional(
    Type.String({
      description: "Optional CSS selector to narrow the observation to matching elements.",
    }),
  ),
});

export const browserObserveTool: AppTool<typeof ObserveParams> = {
  name: "browser/observe",
  label: "Observe Browser",
  description:
    "Capture a screenshot of the active browser tab and return a structured accessibility snapshot. The LLM uses the returned `ref`s (e0, e1, ...) when calling browser/click, browser/type, and browser/extract. Re-run after every navigation or DOM mutation; stale refs return an error.",
  riskLevel: "safe",
  parameters: ObserveParams,
  async execute(toolCallId, params) {
    const opts = params as { artifactId?: string; maxRefs?: number; selector?: string };
    const resolved = resolveBrowserArtifact(opts.artifactId);
    const manager = getBrowserSessionManager();
    const observation = await manager.observe(resolved.sessionId, resolved.artifactId, {
      maxRefs: opts.maxRefs,
      selector: opts.selector,
    });
    return {
      content: [
        {
          text: `Observed ${observation.url} — title "${observation.title}"`,
          type: "text",
        },
      ],
      details: {
        action: "observe",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "observe",
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        observation,
        toolCallId,
      },
    };
  },
};