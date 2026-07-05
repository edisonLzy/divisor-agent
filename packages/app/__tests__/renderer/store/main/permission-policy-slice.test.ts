import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createPermissionPolicySlice } from "../../../../src/renderer/store/main/permission-policy-slice.js";
import type { MainStoreState } from "../../../../src/renderer/store/main/store-state.js";

describe("permission policy slice", () => {
  it("stores permission mode independently by session", () => {
    const store = createStore<MainStoreState>()(
      (...args) => ({ ...createPermissionPolicySlice(...args) }) as MainStoreState,
    );
    store.getState().setPermissionMode("session-a", "bypasspermission");

    expect(store.getState().getPermissionPolicyState("session-a").mode).toBe("bypasspermission");
    expect(store.getState().getPermissionPolicyState("session-b").mode).toBe("default");
  });
});
