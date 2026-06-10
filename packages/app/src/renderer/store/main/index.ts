import { createStore } from "zustand/vanilla";

import { createEntriesSlice } from "../entries-slice";
import type { MainStoreState } from "../types";
import { createArtifactSlice } from "./artifact-slice";
import { createPermissionSlice } from "./permission-slice";
import { createSessionsSlice } from "./session-slice";

export const mainStore = createStore<MainStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createSessionsSlice(...args),
  ...createPermissionSlice(...args),
  ...createArtifactSlice(...args),
}));
