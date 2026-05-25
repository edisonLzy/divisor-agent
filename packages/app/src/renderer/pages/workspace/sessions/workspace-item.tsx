import type { Workspace, Session } from "@renderer/apis/sessions";
import {
  listSessions,
  pinWorkspace,
  deleteWorkspace,
  updateWorkspace,
  createSession,
} from "@renderer/apis/sessions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { cn } from "@renderer/lib/utils";
import { sessionStore } from "@renderer/store/sessions";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, Pin, PinOff, Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

import { SessionItem } from "./session-item";

// ── Props ───────────────────────────────────────────────────────────────────

interface WorkspaceItemProps {
  workspace: Workspace;
}

// ── Component ───────────────────────────────────────────────────────────────

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["sessions", "workspace", workspace.id],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await listSessions({
        workspaceId: workspace.id,
        isTop: false,
        limit: 50,
        offset: pageParam,
      });
      // Sync fetched sessions to store
      sessionStore.getState().addSessions(result.sessions);
      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    enabled: open,
  });

  const sessions = data?.pages.flatMap((page) => page.sessions) ?? [];

  const handleTogglePin = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await pinWorkspace(workspace.id, { isTop: !workspace.isTop });
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      } catch (error) {
        console.error("Failed to toggle workspace pin:", error);
      }
    },
    [workspace.id, workspace.isTop, queryClient],
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteWorkspace(workspace.id);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (error) {
      console.error("Failed to delete workspace:", error);
    }
  }, [workspace.id, queryClient]);

  const handleCreateSession = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const newSession = await createSession({
          name: "新对话",
          workspaceId: workspace.id,
          parentSessionId: null,
        });
        sessionStore.getState().addSessions([newSession]);
        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        // Expand the workspace to show the new session
        setOpen(true);
      } catch (error) {
        console.error("Failed to create session:", error);
      }
    },
    [workspace.id, queryClient],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1 text-left">
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="truncate">{workspace.name || "untitled"}</span>
        </CollapsibleTrigger>

        <button
          onClick={handleTogglePin}
          className="flex items-center justify-center rounded p-0.5 text-sidebar-foreground/30 transition-colors hover:text-sidebar-foreground"
          title={workspace.isTop ? "取消置顶" : "置顶"}
        >
          {workspace.isTop ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>

        <button
          onClick={handleCreateSession}
          className="flex items-center justify-center rounded p-0.5 text-sidebar-foreground/30 transition-colors hover:text-sidebar-foreground"
          title="新建对话"
        >
          <Plus className="size-3.5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center justify-center rounded p-0.5 text-sidebar-foreground/30 transition-colors hover:text-sidebar-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
              <Trash2 className="size-3.5" />
              删除工作区
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CollapsibleContent>
        <div className="ml-2 space-y-px py-0.5">
          {isLoading ? (
            <div className="px-2 py-1 text-[12px] text-muted-foreground/40">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="px-2 py-1 text-[12px] text-muted-foreground/40 break-keep truncate">
              暂无对话
            </div>
          ) : (
            <>
              {sessions.map((s: Session) => (
                <SessionItem key={s.id} session={s} />
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
