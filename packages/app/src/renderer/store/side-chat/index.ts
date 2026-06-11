import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import { createSideChatSlice } from "./side-chat-slice";
import type { SideChatStoreState } from "./store-state";

export const sideChatStore = createStore<SideChatStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSideChatSlice(...args),
}));
