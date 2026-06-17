import type { InstalledMainExtension } from "@divisor-agent/extension-core/main";
import extension from "@divisor-agent/extension-example/main";
import manifest from "@divisor-agent/extension-example/manifest";
import subagentsExtension from "@divisor-agent/extension-subagents/main";
import subagentsManifest from "@divisor-agent/extension-subagents/manifest";

export const installedMainExtensions: InstalledMainExtension[] = [
  { manifest, extension },
  { manifest: subagentsManifest, extension: subagentsExtension },
];
