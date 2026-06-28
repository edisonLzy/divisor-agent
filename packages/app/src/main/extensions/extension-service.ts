import { MainExtensionBridge } from "@divisor-agent/extension-core/main";
import type {
  ExtensionAgentModel,
  ExtensionAgentToolOptions,
  MainExtensionBridgeServices,
} from "@divisor-agent/extension-core/main";

import type { SystemPromptBuilder } from "../prompt/index.js";
import type { AppTool } from "../tools/index.js";
import { installedMainExtensions } from "./installed-extensions.js";
import type { ExtensionRuntimeService } from "./runtime-service.js";

export interface ExtensionToolRuntimeContext {
  getModel(): ExtensionAgentModel | undefined;
  getSessionId(): string | undefined;
}

export class ExtensionService extends MainExtensionBridge implements SystemPromptBuilder {
  constructor(
    private runtimeService?: ExtensionRuntimeService,
    services: Omit<MainExtensionBridgeServices, "runtime"> = {},
  ) {
    super(installedMainExtensions, { ...services, runtime: runtimeService });
    this.initialize();
  }

  setRuntimeService(runtimeService: ExtensionRuntimeService) {
    this.runtimeService = runtimeService;
  }

  buildSystemPrompt(raw: string): string {
    const prompts = this.getSystemPrompts().join("\n\n");
    if (!prompts) return raw;
    return prompts + "\n\n" + raw;
  }

  getToolsForRuntime(
    context: ExtensionToolRuntimeContext,
    options: ExtensionAgentToolOptions = {},
  ) {
    if (options.includeExtensions === false) {
      return [];
    }

    const excluded = new Set(options.excludeToolNames ?? []);

    return this.getTools()
      .filter((tool) => !excluded.has(tool.name))
      .map((tool) => this.bindToolToRuntimeContext(tool as AppTool, context));
  }

  private bindToolToRuntimeContext(tool: AppTool, context: ExtensionToolRuntimeContext): AppTool {
    return {
      ...tool,
      execute: async (...args: Parameters<AppTool["execute"]>) => {
        if (!this.runtimeService) {
          return tool.execute(...args);
        }

        return this.runtimeService.runWithContext(context, () => tool.execute(...args));
      },
    };
  }
}
