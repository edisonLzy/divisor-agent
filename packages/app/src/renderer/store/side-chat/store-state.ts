import type { EntriesSlice } from "../entries-slice";
import type { SideChatSlice } from "./side-chat-slice";

export type SideChatStoreState = EntriesSlice & SideChatSlice;
