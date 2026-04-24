import type { AgentTool } from '@mariozechner/pi-agent-core';

export interface AppExtension {
  name: string;
  version: string;
  tools?: AgentTool<any>[];
  systemPrompts?: string[];
}

export interface DiscoveredExtension {
  name: string;
  version: string;
  path: string;
  manifest: {
    name: string;
    version: string;
    main: string;
  };
}

export class ExtensionRegistry {
  private extensions = new Map<string, AppExtension>();
  private sources = new Map<string, string>();

  register(ext: AppExtension, sourcePath: string) {
    this.extensions.set(ext.name, ext);
    this.sources.set(ext.name, sourcePath);
  }

  getTools(): AgentTool<any>[] {
    const tools: AgentTool<any>[] = [];
    for (const ext of this.extensions.values()) {
      tools.push(...(ext.tools ?? []));
    }
    return tools;
  }

  getSystemPrompts(): string[] {
    const prompts: string[] = [];
    for (const ext of this.extensions.values()) {
      prompts.push(...(ext.systemPrompts ?? []));
    }
    return prompts;
  }

  listExtensions(): { name: string; version: string; path: string }[] {
    return Array.from(this.extensions.entries()).map(([name, ext]) => ({
      name,
      version: ext.version,
      path: this.sources.get(name) ?? '',
    }));
  }
}
