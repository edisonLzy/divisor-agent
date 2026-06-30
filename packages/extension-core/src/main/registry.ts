import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ExtensionMetadata } from "../common/ipc/index.js";
import type { MainSystemPromptRegistration } from "./define.js";

export class MainExtensionRegistry {
  private extensions = new Map<string, ExtensionMetadata>();
  private prompts: Array<{
    extension: ExtensionMetadata;
    prompt: MainSystemPromptRegistration;
  }> = [];
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
    this.prompts = [];
    this.tools = [];
  }
}
