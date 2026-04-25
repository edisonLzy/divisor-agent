import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

import type { DiscoveredExtension } from "./registry.js";

const EXTENSION_DIRS = [".pi/extensions"];

function getExtensionManifest(path: string): DiscoveredExtension["manifest"] | null {
  try {
    const pkgPath = join(path, "package.json");
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      name?: string;
      version?: string;
      main?: string;
    };
    return {
      name: pkg.name ?? "unnamed",
      version: pkg.version ?? "0.0.0",
      main: pkg.main ?? "index.js",
    };
  } catch {
    return null;
  }
}

export function discoverExtensions(homeDir: string): DiscoveredExtension[] {
  const discovered: DiscoveredExtension[] = [];

  for (const relativePath of EXTENSION_DIRS) {
    const fullPath = resolve(homeDir, relativePath);
    if (!existsSync(fullPath)) continue;

    let entries: string[];
    try {
      entries = readdirSync(fullPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const extPath = join(fullPath, entry);
      const manifest = getExtensionManifest(extPath);
      if (!manifest) continue;

      discovered.push({
        name: manifest.name,
        version: manifest.version,
        path: extPath,
        manifest,
      });
    }
  }

  return discovered;
}
