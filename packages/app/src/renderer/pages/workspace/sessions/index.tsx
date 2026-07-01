import { createWorkspace } from "@renderer/apis/sessions";
import { Button } from "@renderer/components/ui/button";
import {
  CollapsibleContent,
  CollapsibleTrigger,
  Collapsible,
} from "@renderer/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { FolderPlus, MessageSquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import { useCreateSession } from "../use-create-session";
import { BottomActions } from "./bottom-actions";
import { SessionItem } from "./session-item";
import { TopActions } from "./top-actions";
import { usePinnedSessions } from "./use-pinned-sessions";
import { useStandaloneSessions } from "./use-standalone-sessions";
import { useWorkspaces, useInvalidateWorkspaces } from "./use-workspaces";
import { WorkspaceItem } from "./workspace-item";

// ── Sessions (Sidebar) ──────────────────────────────────────────────────────

export function Sessions() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-sidebar text-[13px] text-sidebar-foreground/75 select-none">
      <TopActions />

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 py-4">
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
  const { pinnedSessions, pinnedWorkspaces } = usePinnedSessions();
  const hasContent = pinnedSessions.length > 0 || pinnedWorkspaces.length > 0;

  return (
    <GroupSection title="置顶">
      {hasContent ? (
        <>
          {pinnedSessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
          {pinnedWorkspaces.map((ws) => (
            <WorkspaceItem key={ws.id} workspace={ws} />
          ))}
        </>
      ) : (
        <div className="truncate break-keep px-3 py-1.5 text-[12px] text-sidebar-foreground/30">
          暂无置顶
        </div>
      )}
    </GroupSection>
  );
}

// ── WorkspacesGroup ─────────────────────────────────────────────────────────

function WorkspacesGroup() {
  const { workspaces } = useWorkspaces();

  return (
    <GroupSection title="项目" action={<CreateWorkspaceButton />}>
      {workspaces.length > 0 ? (
        workspaces.map((ws) => <WorkspaceItem key={ws.id} workspace={ws} />)
      ) : (
        <div className="truncate break-keep px-3 py-1.5 text-[12px] text-sidebar-foreground/30">
          暂无项目
        </div>
      )}
    </GroupSection>
  );
}

// ── CreateWorkspaceButton ────────────────────────────────────────────────────

function CreateWorkspaceButton() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const invalidateWorkspaces = useInvalidateWorkspaces();

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await createWorkspace({ name: name.trim(), systemPrompt: systemPrompt.trim() || null });
      setName("");
      setSystemPrompt("");
      setDialogOpen(false);
      await invalidateWorkspaces();
    } catch (error) {
      console.error("Failed to create workspace:", error);
    } finally {
      setIsCreating(false);
    }
  }, [name, systemPrompt, invalidateWorkspaces]);

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="flex items-center justify-center rounded-sm border border-transparent p-0.5 text-sidebar-foreground/45 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
        title="创建项目"
      >
        <FolderPlus className="size-3.5" />
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建项目</DialogTitle>
            <DialogDescription>创建一个新的工作区来组织相关对话。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/80">名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入工作区名称"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (name.trim()) handleCreate();
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/80">系统提示（可选）</label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="输入系统提示词..."
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">取消</Button>} />
            <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
              {isCreating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function ChatGroup() {
  const { sessions, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useStandaloneSessions();
  const { handleCreateSession } = useCreateSession();

  return (
    <GroupSection
      title="对话"
      action={
        <button
          onClick={() => handleCreateSession()}
          className="flex items-center justify-center rounded-sm border border-transparent p-0.5 text-sidebar-foreground/45 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title="新对话"
        >
          <MessageSquarePlus className="size-3.5" />
        </button>
      }
    >
      {isLoading ? (
        <div className="px-3 py-1.5 text-[12px] text-sidebar-foreground/30">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="truncate break-keep px-3 py-1.5 text-[12px] text-sidebar-foreground/30">
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
              className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-[12px] text-sidebar-foreground/35 transition-colors hover:bg-sidebar-accent/80 hover:text-sidebar-foreground disabled:cursor-default disabled:hover:bg-transparent"
            >
              {isFetchingNextPage ? "加载中..." : "加载更多"}
            </button>
          )}
        </>
      )}
    </GroupSection>
  );
}

// ── GroupSection ────────────────────────────────────────────────────────────

interface GroupSectionProps {
  title: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}

function GroupSection({ title, defaultOpen = true, action, children }: GroupSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-1.5">
      <div className="group/section flex items-center gap-1 px-3 py-0.5">
        <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 font-mono text-[10px] font-bold tracking-[0.12em] text-sidebar-foreground/45 uppercase transition-colors hover:text-sidebar-foreground/70">
          <span>{title}</span>
        </CollapsibleTrigger>
        {action && (
          <span className="ml-auto flex shrink-0 opacity-0 transition-opacity group-hover/section:opacity-100">
            {action}
          </span>
        )}
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
