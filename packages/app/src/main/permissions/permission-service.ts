import {
  getPermissionCommandText,
  type PermissionRequest,
  type PermissionResolution,
} from "../../shared/permissions-ipc.js";

export type PermissionCallback = (request: PermissionRequest) => void;

export class PermissionService {
  private pendingPermissions = new Map<
    string,
    {
      request: PermissionRequest;
      resolve: (resolution: PermissionResolution) => void;
    }
  >();
  private rememberedCommandPrefixes = new Map<string, Set<string>>();
  private onRequestCallback: PermissionCallback | null = null;

  setRequestCallback(cb: PermissionCallback) {
    this.onRequestCallback = cb;
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionResolution> {
    return new Promise((resolve) => {
      const pending = { request, resolve };
      this.pendingPermissions.set(request.requestId, pending);

      this.onRequestCallback?.(request);
    });
  }

  rememberApproval(requestId: string, commandPrefix: string): void {
    const normalizedPrefix = commandPrefix.trim();
    if (!normalizedPrefix) {
      return;
    }

    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      return;
    }

    const existingPrefixes =
      this.rememberedCommandPrefixes.get(pending.request.toolName) ?? new Set();
    existingPrefixes.add(normalizedPrefix);
    this.rememberedCommandPrefixes.set(pending.request.toolName, existingPrefixes);
  }

  shouldAutoApprove(request: Pick<PermissionRequest, "toolName" | "operation" | "args">): boolean {
    const rememberedPrefixes = this.rememberedCommandPrefixes.get(request.toolName);
    if (!rememberedPrefixes?.size) {
      return false;
    }

    const commandText = getPermissionCommandText(request);
    if (!commandText) {
      return false;
    }

    for (const prefix of rememberedPrefixes) {
      if (commandText.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  approve(requestId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve({ approved: true });
      this.pendingPermissions.delete(requestId);
    }
  }

  reject(requestId: string, reason?: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve({ approved: false, reason });
      this.pendingPermissions.delete(requestId);
    }
  }
}
