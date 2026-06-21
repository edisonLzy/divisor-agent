import type { InstalledRendererExtension } from "@divisor-agent/extension-core/renderer";
import manifest from "@divisor-agent/extension-example/manifest";
import extension from "@divisor-agent/extension-example/renderer";
import filesManifest from "@divisor-agent/extension-files/manifest";
import filesExtension from "@divisor-agent/extension-files/renderer";
import subagentsManifest from "@divisor-agent/extension-subagents/manifest";
import subagentsExtension from "@divisor-agent/extension-subagents/renderer";

export const installedRendererExtensions: InstalledRendererExtension[] = [
  { manifest, extension },
  { manifest: subagentsManifest, extension: subagentsExtension },
  { manifest: filesManifest, extension: filesExtension },
];
