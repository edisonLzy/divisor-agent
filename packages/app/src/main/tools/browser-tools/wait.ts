import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const WaitParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  selector: Type.Optional(
    Type.String({
      description: "CSS selector to wait for. The tool polls every 100ms.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: "Substring to wait for in the latest a11y snapshot.",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: "Timeout in milliseconds (default 5000).",
    }),
  ),
});

export const browserWaitTool: AppTool<typeof WaitParams> = {
  name: "browser/wait",
  label: "Wait For Condition",
  description:
    "Block until a CSS selector matches an element, text appears in the a11y snapshot, or the timeout elapses. Always prefer this over sleep()-style pauses.",
  riskLevel: "safe",
  parameters: WaitParams,
  async execute(toolCallId, params) {
    const { artifactId, selector, text, timeoutMs } = params as {
      artifactId?: string;
      selector?: string;
      text?: string;
      timeoutMs?: number;
    };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const deadline = Date.now() + (timeoutMs ?? 5000);

    while (Date.now() < deadline) {
      const observation = await manager.observe(resolved.sessionId, resolved.artifactId);
      if (selector) {
        const hit = await manager
          .requireActiveTab(resolved.sessionId, resolved.artifactId)
          .webContents.executeJavaScript(
            `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
            true,
          );
        if (hit) {
          return {
            content: [{ text: `Selector "${selector}" appeared`, type: "text" }],
            details: {
              action: "wait",
              artifactId: resolved.artifactId,
              observation,
              selector,
              toolCallId,
            },
          };
        }
      }
      if (text && observation.a11yText.includes(text)) {
        return {
          content: [{ text: `Text "${text}" appeared`, type: "text" }],
          details: {
            action: "wait",
            artifactId: resolved.artifactId,
            observation,
            text,
            toolCallId,
          },
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      `Wait condition not met within ${timeoutMs ?? 5000}ms${
        selector ? ` (selector=${selector})` : ""
      }${text ? ` (text=${text})` : ""}`,
    );
  },
};