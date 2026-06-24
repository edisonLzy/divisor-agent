import type { EntriesSlice } from "../entries-slice";
import type { ArtifactSlice } from "./artifact-slice";
import type { PendingMessagesSlice } from "./pending-messages-slice";
import type { PermissionSlice } from "./permission-slice";
import type { SessionsSlice } from "./session-slice";

export type MainStoreState = EntriesSlice &
  SessionsSlice &
  PermissionSlice &
  ArtifactSlice &
  PendingMessagesSlice;
