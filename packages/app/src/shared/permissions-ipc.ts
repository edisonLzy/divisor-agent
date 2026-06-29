export type PermissionMode = "default" | "bypasspermission";

type PermissionCommandSource = Pick<PermissionRequest, "toolName" | "operation" | "args">;

function stringifyPermissionArgs(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function getPermissionCommandText({ toolName, operation, args }: PermissionCommandSource) {
  const command = args.command;
  if (
    (toolName === "terminal/create" || toolName === "run_in_terminal") &&
    typeof command === "string" &&
    command.trim().length > 0
  ) {
    return command.trim();
  }

  if (operation.trim().length > 0) {
    return operation.trim();
  }

  return stringifyPermissionArgs(args);
}

export function getPermissionCommandPrefix(commandText: string) {
  const segments = commandText.trim().split(/\s+/).filter(Boolean);
  if (!segments.length) {
    return "";
  }

  return segments.slice(0, Math.min(3, segments.length)).join(" ");
}

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
  rememberCommandPrefix?: string;
}
