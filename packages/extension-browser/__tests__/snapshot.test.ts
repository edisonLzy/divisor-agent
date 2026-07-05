import { describe, expect, it, vi } from "vitest";

import { SnapshotService } from "../src/main/snapshot";

function createContents() {
  const sendCommand = vi.fn(async (method: string) => {
    if (method === "Accessibility.getFullAXTree") {
      return {
        nodes: [
          { childIds: ["button", "text"], nodeId: "root", role: { value: "RootWebArea" } },
          {
            backendDOMNodeId: 12,
            name: { value: "Submit" },
            nodeId: "button",
            properties: [{ name: "focusable", value: { value: true } }],
            role: { value: "button" },
          },
          {
            backendDOMNodeId: 13,
            name: { value: "Hello" },
            nodeId: "text",
            role: { value: "StaticText" },
          },
        ],
      };
    }
    if (method === "Target.getTargets") return { targetInfos: [] };
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelectorAll") return { nodeIds: [20] };
    if (method === "DOM.describeNode") {
      return {
        node: {
          attributes: ["onclick", "go()", "aria-label", "Custom"],
          backendNodeId: 21,
          nodeName: "DIV",
        },
      };
    }
    if (method === "DOM.resolveNode") return { object: { objectId: "object-1" } };
    if (method === "Runtime.callFunctionOn") return { result: { value: "Submit text" } };
    return {};
  });
  return {
    debugger: { attach: vi.fn(), isAttached: vi.fn(() => false), sendCommand },
  } as never;
}

describe("SnapshotService", () => {
  it("creates refs for AX and non-standard interactive elements", async () => {
    const service = new SnapshotService();
    const result = await service.snapshot("tab", createContents());
    expect(result.snapshot).toContain('[@e1] button "Submit"');
    expect(result.snapshot).toContain('[@e2] interactive "Custom"');
  });

  it("invalidates refs after navigation", async () => {
    const service = new SnapshotService();
    const contents = createContents();
    await service.snapshot("tab", contents);
    service.markNavigated("tab");
    await expect(service.get("tab", contents, "@e1", "text")).rejects.toMatchObject({
      code: "browser_stale_ref",
    });
  });
});
