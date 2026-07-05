import browserExtension from "@divisor-agent/extension-browser/main";
import type { AnyMainExtensionDefinition } from "@divisor-agent/extension-core/main";
import extension from "@divisor-agent/extension-example/main";
import filesExtension from "@divisor-agent/extension-files/main";
import subagentsExtension from "@divisor-agent/extension-subagents/main";

export const installedMainExtensions = [
  browserExtension,
  extension,
  subagentsExtension,
  filesExtension,
] satisfies AnyMainExtensionDefinition[];
