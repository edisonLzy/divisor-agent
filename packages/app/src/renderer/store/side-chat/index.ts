import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { EntriesSlice } from "../entries-slice";
import { createUserInteractionSlice } from "../user-interaction-slice";
import type { UserInteractionSlice } from "../user-interaction-slice";
import { createSideChatSlice } from "./side-chat-slice";
import type { SideChatSlice } from "./side-chat-slice";

export type SideChatStoreState = EntriesSlice & SideChatSlice & UserInteractionSlice;

export const sideChatStore = createStore<SideChatStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSideChatSlice(...args),
  ...createUserInteractionSlice<SideChatStoreState>(...args),
}));
