import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { SideChatStoreState } from "../types";
import { createSideChatSlice } from "./side-chat-slice";

export const sideChatStore = createStore<SideChatStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSideChatSlice(...args),
}));
