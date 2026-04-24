// ============================================================
// IPC channel types
// ============================================================

export interface AvailableModel {
  providerId: string;
  modelId: string;
  modelName: string;
}

export interface SessionPromptParams {
  sessionId: string;
  content: string;
  model?: {
    providerId: string;
    modelId: string;
  };
}

export interface PermissionApproveParams {
  requestId: string;
}

export interface PermissionRejectParams {
  requestId: string;
}

/**
 * Typed map for renderer → main IPC invocations.
 * Each key is a channel name; value describes its params and return type.
 * `params: void` means the channel takes no arguments.
 */
export interface IpcInvokeMap {
  setModel: {
    params: { sessionId: string; provider: string; modelId: string };
    return: void;
  };
  cycleModel: {
    params: { sessionId: string; direction?: 'next' | 'prev' };
    return: void;
  };
  getAvailableModels: {
    params: void;
    return: AvailableModel[];
  };
  sessionPrompt: {
    params: SessionPromptParams;
    return: void;
  };
  permissionApprove: {
    params: PermissionApproveParams;
    return: void;
  };
  permissionReject: {
    params: PermissionRejectParams;
    return: void;
  };
}

// ============================================================
// Main → Renderer push events
// ============================================================

export interface AgentMessageChunkPayload {
  type: 'text_delta' | 'thinking_delta';
  delta: string;
  chunkIndex: number;
  sessionId: string;
}

export interface AgentMessageDonePayload {
  sessionId: string;
}

export interface SessionRequestPermissionPayload {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}

export interface SessionForkedPayload {
  newSessionId: string;
  parentSessionId: string;
}

/**
 * Typed map for main → renderer push events.
 * Each key is an event name; value is the payload type.
 */
export interface IpcEventMap {
  agentMessageChunk: AgentMessageChunkPayload;
  agentMessageDone: AgentMessageDonePayload;
  sessionRequestPermission: SessionRequestPermissionPayload;
  sessionForked: SessionForkedPayload;
}

/** Discriminated union of all push events from main to renderer. */
export type MainToRendererMessage = {
  [E in keyof IpcEventMap]: { event: E; payload: IpcEventMap[E] };
}[keyof IpcEventMap];

// ============================================================
// Internal types
// ============================================================

export interface PendingPermission {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

export interface SessionRuntimeState {
  sessionId: string;
  pendingPermissions: Map<string, PendingPermission>;
}
