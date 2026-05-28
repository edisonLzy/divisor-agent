import { listWorkspaces } from "@renderer/apis/sessions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useInvalidateWorkspaceList } from "./use-workspace-list";

// ── Data Hook ───────────────────────────────────────────────────────────────

export function useWorkspaces() {
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", "non-pinned"],
    queryFn: () => listWorkspaces({ isTop: false }),
  });

  return { workspaces: workspaces ?? [] };
}

// ── Invalidation Hooks ──────────────────────────────────────────────────────

export function useInvalidateWorkspaces() {
  return useInvalidateWorkspaceList();
}

export function useInvalidateWorkspaceSessions() {
  const queryClient = useQueryClient();
  return useCallback(
    async (workspaceId: string) => {
      await queryClient.invalidateQueries({
        queryKey: ["sessions", "workspace", workspaceId],
      });
    },
    [queryClient],
  );
}
