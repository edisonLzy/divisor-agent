import { listWorkspaces } from "@renderer/apis/sessions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// ── Shared workspace list hook ──────────────────────────────────────────────

const WORKSPACE_QUERY_KEY = ["workspaces"] as const;

export function useWorkspaceList() {
  return useQuery({
    queryKey: WORKSPACE_QUERY_KEY,
    queryFn: () => listWorkspaces(),
    staleTime: 30_000,
  });
}

// ── Invalidation ────────────────────────────────────────────────────────────

export function useInvalidateWorkspaceList() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_QUERY_KEY });
  }, [queryClient]);
}
