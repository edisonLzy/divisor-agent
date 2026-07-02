import type { Workspace, Session } from "@renderer/apis/sessions";
import { listSessions, pinWorkspace, deleteWorkspace } from "@renderer/apis/sessions";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@renderer/components/ui/dialog";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderOpen } from "lucide-react";
import { useCallback, useState } from "react";

import { SessionItem } from "./session-item";

// ── Props ───────────────────────────────────────────────────────────────────

interface WorkspaceItemProps {
  workspace: Workspace;
}

// ── Component ───────────────────────────────────────────────────────────────

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
      mainStore.getState().addSessions(result.sessions);
      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 30_000,
  });

  const sessions = data?.pages.flatMap((page) => page.sessions) ?? [];
  const sessionCount = data ? (hasNextPage ? `${sessions.length}+` : String(sessions.length)) : "—";

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

  const confirmDelete = useCallback(async () => {
    try {
      await deleteWorkspace(workspace.id);
      // Clean up sessions belonging to this workspace from local store
      const store = mainStore.getState();
      store.sessions
        .filter((s) => s.workspaceId === workspace.id)
        .forEach((s) => store.removeSession(s.id));
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (error) {
      console.error("Failed to delete workspace:", error);
    }
  }, [workspace.id, queryClient]);

  const handleCreateWorkflowSession = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Always update the pending session with this workspace, even if one already exists
      const store = mainStore.getState();
      store.setActiveSessionId(null);
      store.createPendingSession(workspace.id);
      setOpen(true);
    },
    [workspace.id],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "group/workspace flex min-h-10 w-full items-center gap-2 rounded-md border-2 px-2 py-1 text-[13px] transition-[background-color,color]",
          open
            ? "border-sidebar-border bg-sidebar-accent text-sidebar-foreground shadow-[var(--hard-shadow-sm)]"
            : "border-transparent text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-sidebar-foreground/55" />
          ) : (
            <Folder className="size-4 shrink-0 text-sidebar-foreground/40" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold leading-5">{workspace.name || "untitled"}</span>
            <span className="truncate text-[10px] leading-4 text-sidebar-foreground/45">
              {open ? "项目已展开" : "点击查看项目内对话"}
            </span>
          </span>
        </CollapsibleTrigger>

        <span className="relative flex min-w-32 shrink-0 items-center justify-end">
          <Badge
            className="group-hover/workspace:invisible group-focus-within/workspace:invisible"
            aria-label={data ? `${sessionCount} 个对话` : "对话数量尚未加载"}
          >
            {sessionCount}
          </Badge>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/workspace:pointer-events-auto group-hover/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto group-focus-within/workspace:opacity-100">
            <Button
              variant="outline-flat"
              size="xs"
              onClick={handleTogglePin}
              title={workspace.isTop ? "取消置顶" : "置顶"}
            >
              {workspace.isTop ? "取消置顶" : "置顶"}
            </Button>
            <Button
              variant="outline-flat"
              size="xs"
              onClick={handleCreateWorkflowSession}
              title="新建对话"
            >
              新建
            </Button>
            <Button
              variant="destructive-outline"
              size="xs"
              onClick={() => setDeleteDialogOpen(true)}
              title="删除"
            >
              删除
            </Button>
          </span>
        </span>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 py-1 pl-4">
          {isLoading ? (
            <div className="px-3 py-1.5 text-[12px] text-sidebar-foreground/30">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="truncate break-keep px-3 py-1.5 text-[12px] text-sidebar-foreground/30">
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
                  className="mt-1 w-full rounded-sm border-2 border-transparent px-3 py-1.5 text-left text-[12px] text-sidebar-foreground/40 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {isFetchingNextPage ? "加载中..." : "加载更多"}
                </button>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除工作区</DialogTitle>
            <DialogDescription>
              确定要删除工作区「{workspace.name || "untitled"}
              」吗？该工作区下的所有对话也将被一并删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">取消</Button>} />
            <Button
              variant="destructive"
              onClick={() => {
                void confirmDelete();
                setDeleteDialogOpen(false);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
