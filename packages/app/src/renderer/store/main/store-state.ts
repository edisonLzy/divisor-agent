import type { EntriesSlice } from "../entries-slice";
import type { ArtifactSlice } from "./artifact-slice";
import type { HumanInTheLoopSlice } from "./human-in-the-loop-slice";
import type { PendingMessagesSlice } from "./pending-messages-slice";
import type { PermissionPolicySlice } from "./permission-policy-slice";
import type { SessionsSlice } from "./session-slice";

export type MainStoreState = EntriesSlice &
  SessionsSlice &
  PermissionPolicySlice &
  HumanInTheLoopSlice &
  ArtifactSlice &
  PendingMessagesSlice;
