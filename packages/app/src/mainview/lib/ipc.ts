import type {
  AgentHostBridge,
  AgentHostEvent,
  PermissionPayload,
  SessionPromptPayload,
} from '../types/ipc';

const CHANNEL = 'divisor-agent:agent-event';

function getBridge(): AgentHostBridge | null {
  const maybeBridge = (window as Window & { divisorAgent?: AgentHostBridge }).divisorAgent;

  return maybeBridge ?? null;
}

function subscribeViaWindow(listener: (event: AgentHostEvent) => void): () => void {
  const handler = (event: Event): void => {
    const customEvent = event as CustomEvent<AgentHostEvent>;

    listener(customEvent.detail);
  };

  window.addEventListener(CHANNEL, handler);

  return () => {
    window.removeEventListener(CHANNEL, handler);
  };
}

export async function sessionPrompt(payload: SessionPromptPayload): Promise<void> {
  const bridge = getBridge();

  if (!bridge) {
    throw new Error('Agent bridge is unavailable in current environment.');
  }

  await bridge.sessionPrompt(payload);
}

export async function permissionApprove(payload: PermissionPayload): Promise<void> {
  const bridge = getBridge();

  if (!bridge) {
    throw new Error('Agent bridge is unavailable in current environment.');
  }

  await bridge.permissionApprove(payload);
}

export async function permissionReject(payload: PermissionPayload): Promise<void> {
  const bridge = getBridge();

  if (!bridge) {
    throw new Error('Agent bridge is unavailable in current environment.');
  }

  await bridge.permissionReject(payload);
}

export function subscribeAgentEvents(listener: (event: AgentHostEvent) => void): () => void {
  const bridge = getBridge();

  if (!bridge) {
    return subscribeViaWindow(listener);
  }

  return bridge.subscribe(listener);
}
