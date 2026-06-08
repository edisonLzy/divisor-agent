import type { InstalledRendererExtension } from "@divisor-agent/extension-core/renderer";
import manifest from "@divisor-agent/extension-example/manifest";
import extension from "@divisor-agent/extension-example/renderer";

export const installedRendererExtensions: InstalledRendererExtension[] = [{ manifest, extension }];
