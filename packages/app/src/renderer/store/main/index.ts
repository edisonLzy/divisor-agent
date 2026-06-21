import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { EntriesSlice } from "../entries-slice";
import { createArtifactSlice } from "./artifact-slice";
import type { ArtifactSlice } from "./artifact-slice";
import { createPendingPromptsSlice } from "./pending-prompts-slice";
import type { PendingPromptsSlice } from "./pending-prompts-slice";
import { createPermissionSlice } from "./permission-slice";
import type { PermissionSlice } from "./permission-slice";
import { createSessionsSlice } from "./session-slice";
import type { SessionsSlice } from "./session-slice";

type MainStoreState = EntriesSlice &
  SessionsSlice &
  PermissionSlice &
  ArtifactSlice &
  PendingPromptsSlice;

export const mainStore = createStore<MainStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSessionsSlice(...args),
  ...createPermissionSlice(...args),
  ...createArtifactSlice(...args),
  ...createPendingPromptsSlice(...args),
}));
