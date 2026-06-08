import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";

import type { ExtensionManifest } from "../manifest.js";

export interface MainSystemPromptRegistration {
  id: string;
  content: string | (() => string);
}

export interface MainExtensionContext {
  manifest: ExtensionManifest;
  systemPrompt: {
    register(prompt: MainSystemPromptRegistration): void;
  };
  tools: {
    register<TParams extends TSchema = TSchema>(tool: AgentTool<TParams>): void;
  };
}

export type MainExtensionSetup = (ctx: MainExtensionContext) => void;

export interface MainExtensionDefinition {
  setup: MainExtensionSetup;
}

export function defineMainExtension(setup: MainExtensionSetup): MainExtensionDefinition {
  return { setup };
}
