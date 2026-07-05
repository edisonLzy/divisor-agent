import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createPermissionSlice } from "../../../../src/renderer/store/main/permission-slice.js";
import type { MainStoreState } from "../../../../src/renderer/store/main/store-state.js";

function createPermissionStore() {
  return createStore<MainStoreState>()(
    (...args) => ({ ...createPermissionSlice(...args) }) as MainStoreState,
  );
}

describe("permission slice", () => {
  it("preserves permission mode while queuing and resolving requests", () => {
    const store = createPermissionStore();
    store.getState().setPermissionMode("session-a", "bypasspermission");
    store.getState().enqueuePermissionRequest("session-a", {
      kind: "permission",
      requestId: "permission-1",
      toolCallId: "tool-1",
      toolName: "terminal/create",
      toolLabel: "Terminal",
      operation: "terminal/create",
      args: { command: "pnpm test" },
      createdAt: 1,
    });

    expect(store.getState().getPermissionState("session-a")).toMatchObject({
      mode: "bypasspermission",
      requests: [{ requestId: "permission-1" }],
    });

    store.getState().resolvePermissionRequest("session-a", "permission-1", { approved: true });
    const state = store.getState().getPermissionState("session-a");
    expect(state.mode).toBe("bypasspermission");
    expect(state.requests).toEqual([]);
    expect(state.lastResolvedRequest?.requestId).toBe("permission-1");
  });
});
