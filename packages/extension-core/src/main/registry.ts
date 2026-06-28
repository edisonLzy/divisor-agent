import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ExtensionDisposer, ExtensionMetadata } from "../common/ipc/index.js";
import type { MainExtensionAgentEvents, MainSystemPromptRegistration } from "./define.js";

export type UntypedExtensionIPCHandler = (...args: any[]) => any;
type SessionDestroyedListener = (
  payload: MainExtensionAgentEvents["session_destroyed"],
) => void | Promise<void>;

export class MainExtensionRegistry {
  private extensions = new Map<string, ExtensionMetadata>();
  private ipcHandlers = new Map<string, Map<string, UntypedExtensionIPCHandler>>();
  private prompts: Array<{
    extension: ExtensionMetadata;
    prompt: MainSystemPromptRegistration;
  }> = [];
  private sessionDestroyedListeners = new Set<SessionDestroyedListener>();
  private tools: AgentTool<any>[] = [];

  registerExtension(extension: ExtensionMetadata) {
    if (this.extensions.has(extension.id)) {
      throw new Error(`Duplicate extension id: ${extension.id}`);
    }
    this.extensions.set(extension.id, { id: extension.id, name: extension.name });
  }

  registerSystemPrompt(extension: ExtensionMetadata, prompt: MainSystemPromptRegistration) {
    this.prompts.push({ extension, prompt });
  }

  registerTool(tool: AgentTool<any>) {
    this.tools.push(tool);
  }

  registerIPCHandler(
    extensionId: string,
    method: string,
    handler: UntypedExtensionIPCHandler,
  ): ExtensionDisposer {
    let handlers = this.ipcHandlers.get(extensionId);
    if (!handlers) {
      handlers = new Map();
      this.ipcHandlers.set(extensionId, handlers);
    }
    if (handlers.has(method)) {
      throw new Error(`Duplicate extension IPC handler: ${extensionId}/${method}`);
    }
    handlers.set(method, handler);

    return () => {
      if (handlers.get(method) === handler) {
        handlers.delete(method);
      }
    };
  }

  async invokeIPC(extensionId: string, method: string, args: unknown[]) {
    if (!this.extensions.has(extensionId)) {
      throw new Error(`Extension is not installed: ${extensionId}`);
    }
    const handler = this.ipcHandlers.get(extensionId)?.get(method);
    if (!handler) {
      throw new Error(`Extension IPC handler not found: ${extensionId}/${method}`);
    }
    return handler(...args);
  }

  onSessionDestroyed(listener: SessionDestroyedListener): ExtensionDisposer {
    this.sessionDestroyedListeners.add(listener);
    return () => this.sessionDestroyedListeners.delete(listener);
  }

  async emitSessionDestroyed(sessionId: string) {
    const results = await Promise.allSettled(
      [...this.sessionDestroyedListeners].map((listener) => listener({ sessionId })),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Extension session_destroyed listener failed", result.reason);
      }
    }
  }

  listExtensions() {
    return Array.from(this.extensions.values());
  }

  getSystemPrompts() {
    return this.prompts.map(({ prompt }) =>
      typeof prompt.content === "function" ? prompt.content() : prompt.content,
    );
  }

  getTools() {
    return [...this.tools];
  }

  dispose() {
    this.extensions.clear();
    this.ipcHandlers.clear();
    this.prompts = [];
    this.sessionDestroyedListeners.clear();
    this.tools = [];
  }
}
