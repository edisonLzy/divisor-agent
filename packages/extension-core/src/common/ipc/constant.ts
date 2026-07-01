export function extensionInvokeChannel(extensionId: string, method: string): string {
  return `extension:${extensionId}:${method}`;
}

export function extensionEventChannel(extensionId: string, event: string): string {
  return `extension:${extensionId}:${event}`;
}
