import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const KEY = Type.Union([
  Type.Literal("Enter"),
  Type.Literal("Tab"),
  Type.Literal("Escape"),
  Type.Literal("Backspace"),
  Type.Literal("Delete"),
  Type.Literal("ArrowUp"),
  Type.Literal("ArrowDown"),
  Type.Literal("ArrowLeft"),
  Type.Literal("ArrowRight"),
  Type.Literal("Home"),
  Type.Literal("End"),
  Type.Literal("PageUp"),
  Type.Literal("PageDown"),
  Type.Literal("Space"),
  Type.Literal("F5"),
]);

const PressParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  key: KEY,
  modifiers: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("Shift"),
        Type.Literal("Control"),
        Type.Literal("Alt"),
        Type.Literal("Meta"),
      ]),
      { description: "Modifier keys held during the key press." },
    ),
  ),
});

const RISKY_KEYS = new Set(["F5"]);
const RISKY_MODS = new Set(["Control", "Meta"]);

export const browserPressTool: AppTool<typeof PressParams> = {
  name: "browser/press",
  label: "Press Key",
  description:
    "Press a single key (with optional modifiers) on the active browser tab. Risky combinations (Ctrl/Meta + key, F5) require user approval via the existing permission flow.",
  riskLevel: "medium",
  parameters: PressParams,
  async execute(toolCallId, params) {
    const { artifactId, key, modifiers } = params as {
      artifactId?: string;
      key: string;
      modifiers?: string[];
    };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const { observation, state } = await manager.dispatch(resolved.sessionId, resolved.artifactId, {
      kind: "press",
      key,
      modifiers,
    });
    return {
      content: [{ text: `Pressed ${key} on ${observation.url}`, type: "text" }],
      details: {
        action: "press",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "press",
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        key,
        modifiers,
        observation,
        state,
        toolCallId,
      },
    };
  },
};

// Exported for future Phase B tests that want to assert the risk heuristic.
export function isRiskyKey(key: string, modifiers: string[] = []): boolean {
  if (RISKY_KEYS.has(key)) return true;
  return modifiers.some((m) => RISKY_MODS.has(m));
}