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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { cn } from "@renderer/lib/utils";
import { sessionStore } from "@renderer/store/sessions";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderOpen, Pin, PinOff, Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

import { useCreateSession } from "../use-create-session";
import { SessionItem } from "./session-item";

// ── Props ───────────────────────────────────────────────────────────────────

interface WorkspaceItemProps {
  workspace: Workspace;
}

// ── Component ───────────────────────────────────────────────────────────────

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

  const handleDelete = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const { handleCreateSession: createPendingSession } = useCreateSession();

  const handleCreateWorkflowSession = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      createPendingSession(workspace.id);
      // Expand the workspace to show pending state
      setOpen(true);
    },
    [workspace.id, createPendingSession],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group flex w-full items-center gap-1 rounded-md px-2 py-1 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {open ? (
            <FolderOpen className="size-4 shrink-0 opacity-60" />
          ) : (
            <Folder className="size-4 shrink-0 opacity-60" />
          )}
          <span className="truncate">{workspace.name || "untitled"}</span>
        </CollapsibleTrigger>

        <span
          className={cn(
            "hidden shrink-0 items-center gap-0.5",
            "group-hover:flex",
            dropdownOpen && "flex",
          )}
        >
          <button
            onClick={handleTogglePin}
            className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-sidebar-foreground"
            title={workspace.isTop ? "取消置顶" : "置顶"}
          >
            {workspace.isTop ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>

          <button
            onClick={handleCreateWorkflowSession}
            className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-sidebar-foreground"
            title="新建对话"
          >
            <Plus className="size-3.5" />
          </button>

          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger
              className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-sidebar-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={2}>
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <Trash2 className="size-3.5 mr-2" />
                删除工作区
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      <CollapsibleContent>
        <div className="pl-4 space-y-[1px] py-0.5">
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
