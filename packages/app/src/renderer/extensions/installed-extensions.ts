import type { InstalledRendererExtension } from "@divisor-agent/extension-core/renderer";
import manifest from "@divisor-agent/extension-example/manifest";
import extension from "@divisor-agent/extension-example/renderer";
import subagentsManifest from "@divisor-agent/extension-subagents/manifest";
import subagentsExtension from "@divisor-agent/extension-subagents/renderer";

export const installedRendererExtensions: InstalledRendererExtension[] = [
  { manifest, extension },
  { manifest: subagentsManifest, extension: subagentsExtension },
];
