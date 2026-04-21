// ============================================================
// WebView → Bun RPC
// ============================================================

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

// ============================================================
// Bun → WebView Messages (pushed by Bun, not RPC responses)
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

export type BunToWebViewMessage =
  | { event: 'agentMessageChunk'; payload: AgentMessageChunkPayload }
  | { event: 'agentMessageDone'; payload: AgentMessageDonePayload }
  | { event: 'sessionRequestPermission'; payload: SessionRequestPermissionPayload }
  | { event: 'sessionForked'; payload: SessionForkedPayload };

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
