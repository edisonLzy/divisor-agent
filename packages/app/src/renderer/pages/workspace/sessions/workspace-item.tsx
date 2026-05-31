import type { Workspace, Session } from "@renderer/apis/sessions";
import { listSessions, pinWorkspace, deleteWorkspace } from "@renderer/apis/sessions";
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
import { sessionStore } from "@renderer/store";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderOpen, Pin, PinOff, Plus, Trash2 } from "lucide-react";
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

  const confirmDelete = useCallback(async () => {
    try {
      await deleteWorkspace(workspace.id);
      // Clean up sessions belonging to this workspace from local store
      const store = sessionStore.getState();
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
      const store = sessionStore.getState();
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
          "group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-[background-color,color]",
          open
            ? "bg-sidebar-accent/70 text-sidebar-foreground"
            : "text-sidebar-foreground/78 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
        )}
      >
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left leading-5">
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-sidebar-foreground/55" />
          ) : (
            <Folder className="size-4 shrink-0 text-sidebar-foreground/40" />
          )}
          <span className="truncate">{workspace.name || "untitled"}</span>
        </CollapsibleTrigger>

        <span className="relative flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleTogglePin}
            className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/32 transition-colors hover:bg-black/10 hover:text-sidebar-foreground"
            title={workspace.isTop ? "取消置顶" : "置顶"}
          >
            {workspace.isTop ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <button
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/32 transition-colors hover:bg-black/10 hover:text-red-400"
            title="删除"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={handleCreateWorkflowSession}
            className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/32 transition-colors hover:bg-black/10 hover:text-sidebar-foreground"
            title="新建对话"
          >
            <Plus className="size-3.5" />
          </button>
        </span>
      </div>

      <CollapsibleContent>
        <div className="space-y-0.5 py-1 pl-4">
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
                  className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-[12px] text-sidebar-foreground/35 transition-colors hover:bg-sidebar-accent/80 hover:text-sidebar-foreground disabled:cursor-default disabled:hover:bg-transparent"
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
