export interface AgentEventsBinder {
  bindEvents(...args: unknown[]): () => void;
}
