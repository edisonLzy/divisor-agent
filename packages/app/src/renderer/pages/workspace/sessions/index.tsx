import {
  CollapsibleContent,
  CollapsibleTrigger,
  Collapsible,
} from "@renderer/components/ui/collapsible";
import type { ReactNode } from "react";

import { BottomActions } from "./bottom-actions";
import { SessionItem } from "./session-item";
import { TopActions } from "./top-actions";
import { usePinnedSessions } from "./use-pinned-sessions";
import { useStandaloneSessions } from "./use-standalone-sessions";
import { useWorkspaces } from "./use-workspaces";
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
        <div className="px-2 py-1 text-[12px] text-muted-foreground/40 break-keep truncate">
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
    <GroupSection title="项目">
      {workspaces.length > 0 ? (
        workspaces.map((ws) => <WorkspaceItem key={ws.id} workspace={ws} />)
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
  const { sessions, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useStandaloneSessions();

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

// ── GroupSection ────────────────────────────────────────────────────────────

interface GroupSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function GroupSection({ title, defaultOpen = true, children }: GroupSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="mt-2 mb-2">
      <CollapsibleTrigger className="cursor-pointer flex w-full items-center px-4 py-1 text-[12px] font-medium text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/70">
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-px px-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
