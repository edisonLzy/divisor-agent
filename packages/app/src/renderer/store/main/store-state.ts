import type { EntriesSlice } from "../entries-slice";
import type { UserInteractionSlice } from "../user-interaction-slice";
import type { ArtifactSlice } from "./artifact-slice";
import type { PendingMessagesSlice } from "./pending-messages-slice";
import type { PermissionModeSlice } from "./permission-mode-slice";
import type { SessionsSlice } from "./session-slice";

export type MainStoreState = EntriesSlice &
  SessionsSlice &
  UserInteractionSlice &
  PermissionModeSlice &
  ArtifactSlice &
  PendingMessagesSlice;
