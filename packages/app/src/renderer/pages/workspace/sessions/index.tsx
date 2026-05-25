import type { Session, Workspace } from "@renderer/apis/sessions";
import { listSessions, listWorkspaces } from "@renderer/apis/sessions";
import { sessionStore } from "@renderer/store/sessions";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

import { BottomActions } from "./bottom-actions";
import { GroupSection } from "./group-section";
import { SessionItem } from "./session-item";
import { TopActions } from "./top-actions";
import { WorkspaceItem } from "./workspace-item";

// ── Sessions (Sidebar) ──────────────────────────────────────────────────────

export function Sessions() {
  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border select-none">
      <TopActions />

      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        <PinGroup />
        <WorkspacesGroup />
        <ChatGroup />
      </div>

      <BottomActions />
    </div>
  );
}

// ── PinGroup ────────────────────────────────────────────────────────────────

function PinGroup() {
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

  const pinnedSessions: Session[] = pinnedData?.sessions ?? [];
  const workspaces: Workspace[] = pinnedWorkspaces ?? [];
  const hasContent = pinnedSessions.length > 0 || workspaces.length > 0;

  return (
    <GroupSection title="置顶">
      {hasContent ? (
        <>
          {pinnedSessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
          {workspaces.map((ws) => (
            <WorkspaceItem key={ws.id} workspace={ws} />
          ))}
        </>
      ) : (
        <div className="px-2 py-1 text-[12px] text-muted-foreground/40 break-keep truncate">
          暂无置顶
        </div>
      )}
    </GroupSection>
  );
}

// ── WorkspacesGroup ─────────────────────────────────────────────────────────

function WorkspacesGroup() {
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", "non-pinned"],
    queryFn: () => listWorkspaces({ isTop: false }),
  });

  const workspaceList: Workspace[] = workspaces ?? [];

  return (
    <GroupSection title="项目">
      {workspaceList.length > 0 ? (
        workspaceList.map((ws) => <WorkspaceItem key={ws.id} workspace={ws} />)
      ) : (
        <div className="px-2 py-1 text-[12px] text-muted-foreground/40 break-keep truncate">
          暂无项目
        </div>
      )}
    </GroupSection>
  );
}

// ── ChatGroup ───────────────────────────────────────────────────────────────

function ChatGroup() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["sessions", "standalone"],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await listSessions({
        workspaceId: null,
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

  const sessions: Session[] = data?.pages.flatMap((page) => page.sessions) ?? [];

  return (
    <GroupSection title="对话">
      {isLoading ? (
        <div className="px-2 py-1 text-[12px] text-muted-foreground/40">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="px-2 py-1 text-[12px] text-muted-foreground/40 break-keep truncate">
          暂无聊天
        </div>
      ) : (
        <>
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full px-2 py-1 text-left text-[12px] text-muted-foreground/40 transition-colors hover:text-sidebar-foreground/70"
            >
              {isFetchingNextPage ? "加载中..." : "加载更多"}
            </button>
          )}
        </>
      )}
    </GroupSection>
  );
}
