export interface SessionNode {
  id: string;
  parentId: string | null;
  name: string;
  timestamp: number;
  children?: SessionNode[];
}

export interface PromptPayload {
  sessionId: string;
  content: string;
  model?: {
    providerId: string;
    modelId: string;
  };
}

export interface PermissionRequest {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}
