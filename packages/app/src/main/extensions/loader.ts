import { join } from "path";

import { discoverExtensions } from "./discovery.js";
import type { AppExtension, DiscoveredExtension } from "./registry.js";
import type { ExtensionRegistry } from "./registry.js";

function normalizeExtName(name: string): string {
  return name.replace(/^@pi-coding-agent\//, "").replace(/^pi-/i, "");
}

async function loadExtensionModule(ext: DiscoveredExtension): Promise<AppExtension | null> {
  try {
    const entryPath = join(ext.path, ext.manifest.main);
    const mod = await import(entryPath);

    const extDef = (mod as any).default ?? (mod as AppExtension);

    return {
      name: normalizeExtName(extDef.name ?? ext.name),
      version: extDef.version ?? ext.version,
      tools: extDef.tools ?? [],
      systemPrompts: extDef.systemPrompts ?? [],
    };
  } catch (err) {
    console.error(`Failed to load extension ${ext.name}:`, err);
    return null;
  }
}

export async function loadAllExtensions(
  registry: ExtensionRegistry,
  homeDir: string,
): Promise<void> {
  const discovered = discoverExtensions(homeDir);

  for (const ext of discovered) {
    const loaded = await loadExtensionModule(ext);
    if (loaded) {
      registry.register(loaded, ext.path);
      console.log(`Loaded extension: ${loaded.name}@${loaded.version} from ${ext.path}`);
    }
  }
}
