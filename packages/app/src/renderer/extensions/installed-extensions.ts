import type { RendererExtensionDefinition } from "@divisor-agent/extension-core/renderer";
import extension from "@divisor-agent/extension-example/renderer";
import filesExtension from "@divisor-agent/extension-files/renderer";
import subagentsExtension from "@divisor-agent/extension-subagents/renderer";

export const installedRendererExtensions = [
  extension,
  subagentsExtension,
  filesExtension,
] satisfies RendererExtensionDefinition[];
