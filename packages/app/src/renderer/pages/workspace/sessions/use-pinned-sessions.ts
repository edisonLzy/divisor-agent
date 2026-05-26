import { listSessions, listWorkspaces } from "@renderer/apis/sessions";
import { sessionStore } from "@renderer/store/sessions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// ── Data Hook ───────────────────────────────────────────────────────────────

export function usePinnedSessions() {
  const { data: pinnedData } = useQuery({
    queryKey: ["sessions", "pinned"],
    queryFn: async () => {
      const result = await listSessions({ isTop: true, limit: 100 });
      sessionStore.getState().addSessions(result.sessions);
      return result;
    },
  });

  const { data: pinnedWorkspaces } = useQuery({
    queryKey: ["workspaces", "pinned"],
    queryFn: () => listWorkspaces({ isTop: true }),
  });

  return {
    pinnedSessions: pinnedData?.sessions ?? [],
    pinnedWorkspaces: pinnedWorkspaces ?? [],
  };
}

// ── Invalidation Hook ───────────────────────────────────────────────────────

export function useInvalidatePinnedSessions() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["sessions", "pinned"] });
    await queryClient.invalidateQueries({ queryKey: ["workspaces", "pinned"] });
  }, [queryClient]);
}
