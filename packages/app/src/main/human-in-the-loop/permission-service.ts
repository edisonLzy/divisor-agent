import {
  getPermissionCommandText,
  type PermissionPayload,
  type PermissionRequest,
  type PermissionResolution,
} from "../../shared/permissions-ipc.js";
import { AbstractHumanInTheLoop } from "./abstract-human-in-the-loop.js";

export type PermissionCallback = (request: PermissionRequest) => void;

export class PermissionService extends AbstractHumanInTheLoop<
  "permission",
  PermissionPayload,
  PermissionResolution
> {
  public readonly kind = "permission" as const;

  private rememberedCommandPrefixes = new Map<string, Set<string>>();
  private onRequestCallback: PermissionCallback | null = null;

  constructor() {
    super();
    this.on("human-in-the-loop", ({ data: { requestId, createdAt, payload } }) => {
      this.onRequestCallback?.({ requestId, createdAt, kind: this.kind, ...payload });
    });
  }

  setRequestCallback(callback: PermissionCallback) {
    this.onRequestCallback = callback;
  }

  requestPermission(payload: PermissionPayload): Promise<PermissionResolution> {
    return this.request(payload);
  }

  rememberApproval(requestId: string, commandPrefix: string): void {
    const normalizedPrefix = commandPrefix.trim();
    const pending = this.getPendingPayload(requestId);
    if (!normalizedPrefix || !pending) return;

    const existingPrefixes = this.rememberedCommandPrefixes.get(pending.toolName) ?? new Set();
    existingPrefixes.add(normalizedPrefix);
    this.rememberedCommandPrefixes.set(pending.toolName, existingPrefixes);
  }

  shouldAutoApprove(request: Pick<PermissionPayload, "toolName" | "operation" | "args">): boolean {
    const rememberedPrefixes = this.rememberedCommandPrefixes.get(request.toolName);
    if (!rememberedPrefixes?.size) return false;

    const commandText = getPermissionCommandText(request);
    for (const prefix of rememberedPrefixes) {
      if (commandText.startsWith(prefix)) return true;
    }
    return false;
  }

  approve(requestId: string): void {
    this.resolve(requestId, { approved: true });
  }

  reject(requestId: string, reason?: string): void {
    this.resolve(requestId, { approved: false, reason });
  }

  protected parsePayload(value: unknown): PermissionPayload {
    if (!value || typeof value !== "object") throw new Error("Invalid permission payload");
    const payload = value as PermissionPayload;
    if (!payload.toolCallId || !payload.toolName || !payload.toolLabel || !payload.operation) {
      throw new Error("Permission payload is missing required tool information");
    }
    if (!payload.args || typeof payload.args !== "object" || Array.isArray(payload.args)) {
      throw new Error("Permission payload args must be an object");
    }
    return { ...payload, args: { ...payload.args } };
  }

  protected parseResult(value: unknown): PermissionResolution {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as PermissionResolution).approved !== "boolean"
    ) {
      throw new Error("Invalid permission resolution");
    }
    const result = value as PermissionResolution;
    return {
      approved: result.approved,
      reason: result.reason?.trim() || undefined,
      rememberCommandPrefix: result.rememberCommandPrefix?.trim() || undefined,
    };
  }
}
