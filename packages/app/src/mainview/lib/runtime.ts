import type { PermissionRequest, PromptPayload } from '../types/session';

interface SessionPromptResult {
  accepted: boolean;
}

interface AgentMessageChunkPayload {
  sessionId: string;
  type: 'text' | 'thinking';
  delta: string;
  chunkIndex: number;
}

interface AgentMessageDonePayload {
  sessionId: string;
}

type RuntimeEventMap = {
  agentMessageChunk: AgentMessageChunkPayload;
  agentMessageDone: AgentMessageDonePayload;
  sessionRequestPermission: PermissionRequest;
};

interface ElectrobunRPC {
  sessionPrompt?: (payload: PromptPayload) => Promise<SessionPromptResult>;
  permissionApprove?: (payload: { requestId: string }) => Promise<void>;
  permissionReject?: (payload: { requestId: string }) => Promise<void>;
}

declare global {
  interface Window {
    electrobun?: {
      rpc?: ElectrobunRPC;
    };
  }
}

function mockStream(payload: PromptPayload): void {
  const chunks = [
    { type: 'thinking' as const, delta: '正在分析需求与上下文…' },
    { type: 'text' as const, delta: `已收到消息：${payload.content}` },
    { type: 'text' as const, delta: '（当前为前端本地模拟流，后续接入 Bun 主进程）' },
  ];

  chunks.forEach((chunk, index) => {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('agentMessageChunk', {
        detail: {
          sessionId: payload.sessionId,
          type: chunk.type,
          delta: chunk.delta,
          chunkIndex: index,
        } satisfies AgentMessageChunkPayload,
      }));
    }, 250 * (index + 1));
  });

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('agentMessageDone', {
      detail: { sessionId: payload.sessionId } satisfies AgentMessageDonePayload,
    }));
  }, 250 * (chunks.length + 1));
}

export async function sessionPrompt(payload: PromptPayload): Promise<SessionPromptResult> {
  const rpc = window.electrobun?.rpc;
  if (rpc?.sessionPrompt) {
    return rpc.sessionPrompt(payload);
  }

  mockStream(payload);
  return { accepted: true };
}

export async function permissionApprove(requestId: string): Promise<void> {
  const rpc = window.electrobun?.rpc;
  if (rpc?.permissionApprove) {
    return rpc.permissionApprove({ requestId });
  }
}

export async function permissionReject(requestId: string): Promise<void> {
  const rpc = window.electrobun?.rpc;
  if (rpc?.permissionReject) {
    return rpc.permissionReject({ requestId });
  }
}

export function subscribeRuntimeEvent<K extends keyof RuntimeEventMap>(
  event: K,
  handler: (payload: RuntimeEventMap[K]) => void,
): () => void {
  const listener = ((e: Event) => {
    const customEvent = e as CustomEvent<RuntimeEventMap[K]>;
    handler(customEvent.detail);
  });

  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}
