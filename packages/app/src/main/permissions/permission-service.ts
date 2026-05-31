import type { PermissionRequest, PermissionResolution } from "../../shared/permissions-ipc.js";

export type PermissionCallback = (request: PermissionRequest) => void;

export class PermissionService {
  private pendingPermissions = new Map<
    string,
    {
      request: PermissionRequest;
      resolve: (resolution: PermissionResolution) => void;
    }
  >();
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
