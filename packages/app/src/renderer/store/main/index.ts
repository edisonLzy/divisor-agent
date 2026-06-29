import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { EntriesSlice } from "../entries-slice";
import { createUserInteractionSlice } from "../user-interaction-slice";
import type { UserInteractionSlice } from "../user-interaction-slice";
import { createArtifactSlice } from "./artifact-slice";
import type { ArtifactSlice } from "./artifact-slice";
import { createPendingMessagesSlice } from "./pending-messages-slice";
import type { PendingMessagesSlice } from "./pending-messages-slice";
import { createPermissionModeSlice } from "./permission-mode-slice";
import type { PermissionModeSlice } from "./permission-mode-slice";
import { createSessionsSlice } from "./session-slice";
import type { SessionsSlice } from "./session-slice";

type MainStoreState = EntriesSlice &
  SessionsSlice &
  UserInteractionSlice &
  PermissionModeSlice &
  ArtifactSlice &
  PendingMessagesSlice;

export const mainStore = createStore<MainStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSessionsSlice(...args),
  ...createUserInteractionSlice<MainStoreState>(...args),
  ...createPermissionModeSlice(...args),
  ...createArtifactSlice(...args),
  ...createPendingMessagesSlice(...args),
}));
