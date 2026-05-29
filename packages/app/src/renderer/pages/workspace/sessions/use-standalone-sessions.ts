import { listSessions } from "@renderer/apis/sessions";
import { sessionStore } from "@renderer/store/sessions";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// ── Data Hook ───────────────────────────────────────────────────────────────

export function useStandaloneSessions() {
  const query = useInfiniteQuery({
    queryKey: ["sessions", "standalone"],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await listSessions({
        noWorkspace: true,
        isTop: false,
        limit: 50,
        offset: pageParam,
      });
      sessionStore.getState().addSessions(result.sessions);
      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  return {
    sessions: query.data?.pages.flatMap((page) => page.sessions) ?? [],
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}

// ── Invalidation Hook ───────────────────────────────────────────────────────

export function useInvalidateStandaloneSessions() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["sessions", "standalone"] });
  }, [queryClient]);
}
