import type { AnyMainExtensionDefinition } from "@divisor-agent/extension-core/main";
import deepResearchExtension from "@divisor-agent/extension-deep-research/main";
import extension from "@divisor-agent/extension-example/main";
import filesExtension from "@divisor-agent/extension-files/main";
import subagentsExtension from "@divisor-agent/extension-subagents/main";

export const installedMainExtensions = [
  extension,
  subagentsExtension,
  filesExtension,
  deepResearchExtension,
] satisfies AnyMainExtensionDefinition[];
