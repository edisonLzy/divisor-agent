export type PermissionMode = "default" | "bypasspermission";

export interface PermissionRequest {
  requestId: string;
  toolCallId: string;
  toolName: string;
  toolLabel: string;
  operation: string;
  args: Record<string, unknown>;
  createdAt: number;
}

export interface PermissionResolution {
  approved: boolean;
  reason?: string;
}

export interface PermissionRequestedEvent extends PermissionRequest {
  type: "permission_requested";
}
