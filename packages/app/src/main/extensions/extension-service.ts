import { MainExtensionBridge } from "@divisor-agent/extension-core/main";

import type { SystemPromptBuilder } from "../prompt/index.js";
import { installedMainExtensions } from "./installed-extensions.js";

export class ExtensionService extends MainExtensionBridge implements SystemPromptBuilder {
  constructor() {
    super(installedMainExtensions);
    this.initialize();
  }

  buildSystemPrompt(raw: string): string {
    const prompts = this.getSystemPrompts().join("\n\n");
    if (!prompts) return raw;
    return prompts + "\n\n" + raw;
  }
}
