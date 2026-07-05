import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { EntriesSlice } from "../entries-slice";
import { createArtifactSlice } from "./artifact-slice";
import type { ArtifactSlice } from "./artifact-slice";
import { createAskUserQuestionSlice } from "./ask-user-question-slice";
import type { AskUserQuestionSlice } from "./ask-user-question-slice";
import { createPendingMessagesSlice } from "./pending-messages-slice";
import type { PendingMessagesSlice } from "./pending-messages-slice";
import { createPermissionSlice } from "./permission-slice";
import type { PermissionSlice } from "./permission-slice";
import { createSessionsSlice } from "./session-slice";
import type { SessionsSlice } from "./session-slice";

type MainStoreState = EntriesSlice &
  SessionsSlice &
  PermissionSlice &
  AskUserQuestionSlice &
  ArtifactSlice &
  PendingMessagesSlice;

export const mainStore = createStore<MainStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSessionsSlice(...args),
  ...createPermissionSlice(...args),
  ...createAskUserQuestionSlice(...args),
  ...createArtifactSlice(...args),
  ...createPendingMessagesSlice(...args),
}));
