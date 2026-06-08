import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { ExtensionManifest } from "../manifest.js";
import type { MainSystemPromptRegistration } from "./define";

export class MainExtensionRegistry {
  private extensions = new Map<string, ExtensionManifest>();
  private prompts: Array<{ manifest: ExtensionManifest; prompt: MainSystemPromptRegistration }> =
    [];
  private tools: AgentTool<any>[] = [];

  registerExtension(manifest: ExtensionManifest) {
    this.extensions.set(manifest.id, manifest);
  }

  registerSystemPrompt(manifest: ExtensionManifest, prompt: MainSystemPromptRegistration) {
    this.prompts.push({ manifest, prompt });
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
}
