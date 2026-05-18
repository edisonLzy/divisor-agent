export type PermissionCallback = (request: {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}) => void;

export class PermissionService {
  private pendingPermissions = new Map<
    string,
    {
      requestId: string;
      operation: string;
      params: Record<string, unknown>;
      resolve: (approved: boolean) => void;
    }
  >();
  private onRequestCallback: PermissionCallback | null = null;

  setRequestCallback(cb: PermissionCallback) {
    this.onRequestCallback = cb;
  }

  async requestPermission(
    requestId: string,
    operation: string,
    params: Record<string, unknown>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const pending = { requestId, operation, params, resolve };
      this.pendingPermissions.set(requestId, pending);

      this.onRequestCallback?.({ requestId, operation, params });
    });
  }

  approve(requestId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve(true);
      this.pendingPermissions.delete(requestId);
    }
  }

  reject(requestId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve(false);
      this.pendingPermissions.delete(requestId);
    }
  }

  isHighRisk(operation: string): boolean {
    const highRisk = ["fs/write_text_file", "terminal/create"];
    return highRisk.includes(operation);
  }
}
