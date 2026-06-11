import { createSession } from "@renderer/apis/sessions";
import { MessageAction } from "@renderer/components/ai-elements/message";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentMessageToRuntimeMessage } from "@renderer/lib/agent-message";
import { type MessageEntry, type SessionEntry } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { GitBranch } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useInvalidateStandaloneSessions } from "../../../sessions/use-standalone-sessions";
import { useInvalidateWorkspaceSessions } from "../../../sessions/use-workspaces";

interface ForkMessageButtonProps {
  sessionId: string;
  entries: SessionEntry[];
  targetEntryId: string;
}

/**
 * Self-contained fork button for assistant messages.
 *
 * On click, creates a new branched session with history up to (and including)
 * the clicked assistant message, then switches the active session to the new fork.
 */
export function ForkMessageButton({ sessionId, entries, targetEntryId }: ForkMessageButtonProps) {
  const { invoke } = useElectronIPC();
  const invalidateStandalone = useInvalidateStandaloneSessions();
  const invalidateWorkspaceSessions = useInvalidateWorkspaceSessions();
  const [isForking, setIsForking] = useState(false);

  const handleFork = useCallback(async () => {
    const store = mainStore.getState();
    const session = store.getSession(sessionId);
    if (!session) return;

    setIsForking(true);

    try {
      // 1. Find the target entry index
      const targetIdx = entries.findIndex((e) => e.id === targetEntryId);
      if (targetIdx < 0) {
        toast.error("无法找到目标消息");
        return;
      }

      // 2. Create a new session with parentSessionId pointing to current
      const newSession = await createSession({
        name: "新对话",
        workspaceId: session.workspaceId,
        parentSessionId: sessionId,
      });

      // 3. Slice entries up to and including the target
      const slicedEntries = entries.slice(0, targetIdx + 1);

      // 4. Add to store and set entries
      store.addSessions([newSession]);
      store.setSessionEntries(newSession.id, slicedEntries);

      // 5. Set runtime session ID
      await invoke("setSessionId", newSession.id);

      // 6. Set history messages on the runtime
      const messageEntries = slicedEntries.filter((e): e is MessageEntry => e.type === "message");
      const runtimeMessages = messageEntries.map((e) => agentMessageToRuntimeMessage(e.data));
      if (runtimeMessages.length > 0) {
        await invoke("setHistoryMessages", newSession.id, runtimeMessages);
      }

      // 7. Switch active session
      store.setActiveSessionId(newSession.id);

      // 8. Refresh sidebar
      await invalidateStandalone();
      if (session.workspaceId) {
        await invalidateWorkspaceSessions(session.workspaceId);
      }
    } catch (error) {
      console.error("Failed to fork session:", error);
      toast.error("创建分支失败");
    } finally {
      setIsForking(false);
    }
  }, [
    sessionId,
    entries,
    targetEntryId,
    invoke,
    invalidateStandalone,
    invalidateWorkspaceSessions,
  ]);

  return (
    <MessageAction tooltip="分支" disabled={isForking} onClick={handleFork}>
      <GitBranch className="size-3.5" />
    </MessageAction>
  );
}
