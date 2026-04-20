export interface SessionPromptPayload {
  sessionId: string;
  content: string;
  model?: {
    providerId: string;
    modelId: string;
  };
}

export interface PermissionPayload {
  requestId: string;
}

export type AgentMessageDeltaType = 'text_delta' | 'thinking_delta';

export interface AgentMessageChunkEvent {
  type: 'agentMessageChunk';
  sessionId: string;
  deltaType: AgentMessageDeltaType;
  delta: string;
  chunkIndex: number;
}

export interface AgentMessageDoneEvent {
  type: 'agentMessageDone';
  sessionId: string;
}

export interface SessionRequestPermissionEvent {
  type: 'sessionRequestPermission';
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}

export interface SessionForkedEvent {
  type: 'sessionForked';
  parentSessionId: string;
  newSessionId: string;
}

export type AgentHostEvent =
  | AgentMessageChunkEvent
  | AgentMessageDoneEvent
  | SessionRequestPermissionEvent
  | SessionForkedEvent;

export interface AgentHostBridge {
  sessionPrompt(payload: SessionPromptPayload): Promise<void>;
  permissionApprove(payload: PermissionPayload): Promise<void>;
  permissionReject(payload: PermissionPayload): Promise<void>;
  subscribe(listener: (event: AgentHostEvent) => void): () => void;
}

export interface StreamChunk {
  id: string;
  kind: AgentMessageDeltaType;
  content: string;
}
