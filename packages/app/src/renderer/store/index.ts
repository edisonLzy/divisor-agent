import { createStore } from "zustand/vanilla";

import { createArtifactSlice } from "./artifact-slice";
import { createEntriesSlice } from "./entries-slice";
import { createPendingInsertSlice } from "./pending-insert-slice";
import { createPermissionSlice } from "./permission-slice";
import { createSessionsSlice } from "./session-slice";
import { createSideChatSlice } from "./sidechat-slice";
import type { SessionsStoreState } from "./types";

export * from "./types";

export const sessionStore = createStore<SessionsStoreState>()((...args) => ({
  ...createArtifactSlice(...args),
  ...createSessionsSlice(...args),
  ...createEntriesSlice(...args),
  ...createPermissionSlice(...args),
  ...createSideChatSlice(...args),
  ...createPendingInsertSlice(...args),
}));
