import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { sessionStore } from "@renderer/store";
import type { PermissionRequest, PermissionResolution } from "@shared/permissions-ipc";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

function updateResolvedToolState(
  sessionId: string,
  request: PermissionRequest,
  resolution: PermissionResolution,
) {
  const store = sessionStore.getState();
  const existing = store.getSession(sessionId)?.toolStates.get(request.toolCallId);

  if (!existing || existing.status === "done" || existing.status === "error") {
    return;
  }

  store.setToolState(sessionId, request.toolCallId, {
    ...existing,
    requestId: request.requestId,
    approvalStatus: resolution.approved ? "approved" : "denied",
    status: resolution.approved ? "running" : "error",
    output: resolution.approved
      ? existing.output
      : resolution.reason?.trim() || existing.output || "Permission request denied by user",
  });
}

export function useCurrentPermissionRequest(sessionId: string | null) {
  const { invoke } = useElectronIPC();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const request = useStore(sessionStore, (state) => {
    if (!sessionId) {
      return null;
    }

    return state.getPermissionState(sessionId).requests[0] ?? null;
  });

  const resolveRequest = useCallback(
    async (resolution: PermissionResolution) => {
      if (!sessionId || !request) {
        return;
      }

      setIsSubmitting(true);

      try {
        await invoke("resolvePermissionRequest", sessionId, request.requestId, resolution);
        sessionStore.getState().resolvePermissionRequest(sessionId, request.requestId, resolution);
        updateResolvedToolState(sessionId, request, resolution);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "提交审批结果失败");
      } finally {
        setIsSubmitting(false);
      }
    },
    [invoke, request, sessionId],
  );

  const approve = useCallback(async () => {
    await resolveRequest({ approved: true });
  }, [resolveRequest]);

  const deny = useCallback(
    async (reason?: string) => {
      await resolveRequest({
        approved: false,
        reason: reason?.trim() || undefined,
      });
    },
    [resolveRequest],
  );

  return {
    request,
    isSubmitting,
    approve,
    deny,
  };
}
