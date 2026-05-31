import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "./entries-slice";
import { createPermissionSlice } from "./permission-slice";
import { createSessionsSlice } from "./session-slice";
import type { SessionsStoreState } from "./types";

export * from "./types";

export const sessionStore = createStore<SessionsStoreState>()((...args) => ({
  ...createSessionsSlice(...args),
  ...createEntriesSlice(...args),
  ...createPermissionSlice(...args),
}));
