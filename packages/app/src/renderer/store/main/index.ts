import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { EntriesSlice } from "../entries-slice";
import { createArtifactSlice } from "./artifact-slice";
import type { ArtifactSlice } from "./artifact-slice";
import { createHumanInTheLoopSlice } from "./human-in-the-loop-slice";
import type { HumanInTheLoopSlice } from "./human-in-the-loop-slice";
import { createPendingMessagesSlice } from "./pending-messages-slice";
import type { PendingMessagesSlice } from "./pending-messages-slice";
import { createPermissionPolicySlice } from "./permission-policy-slice";
import type { PermissionPolicySlice } from "./permission-policy-slice";
import { createSessionsSlice } from "./session-slice";
import type { SessionsSlice } from "./session-slice";

type MainStoreState = EntriesSlice &
  SessionsSlice &
  PermissionPolicySlice &
  HumanInTheLoopSlice &
  ArtifactSlice &
  PendingMessagesSlice;

export const mainStore = createStore<MainStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSessionsSlice(...args),
  ...createPermissionPolicySlice(...args),
  ...createHumanInTheLoopSlice(...args),
  ...createArtifactSlice(...args),
  ...createPendingMessagesSlice(...args),
}));
