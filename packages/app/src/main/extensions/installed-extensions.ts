import type { InstalledMainExtension } from "@divisor-agent/extension-core/main";
import extension from "@divisor-agent/extension-example/main";
import manifest from "@divisor-agent/extension-example/manifest";

export const installedMainExtensions: InstalledMainExtension[] = [{ manifest, extension }];
