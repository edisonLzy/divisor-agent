import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createLogger } from '../shared/logger.js';
import { pluginRegistry } from './registry.js';
import type { ExtensionAPI } from './types.js';

const logger = createLogger('plugins:loader');

function createExtensionAPI(): ExtensionAPI {
  return {
    on(event, handler) {
      pluginRegistry.on(event, handler);
    },
    registerTool(definition) {
      pluginRegistry.registerTool(definition);
    },
  };
}

export function discoverPluginPaths(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const paths: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const indexTs = join(fullPath, 'index.ts');
      const indexJs = join(fullPath, 'index.js');

      if (existsSync(indexTs)) {
        paths.push(indexTs);
      } else if (existsSync(indexJs)) {
        paths.push(indexJs);
      }
    } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
      paths.push(fullPath);
    }
  }

  return paths;
}

export async function loadPluginFile(filePath: string): Promise<void> {
  try {
    const fileUrl = pathToFileURL(filePath).href;
    const mod = await import(fileUrl);
    const factory: unknown = mod.default;

    if (typeof factory !== 'function') {
      logger.warn({ filePath }, 'Plugin does not export a default function, skipping');
      return;
    }

    const api = createExtensionAPI();
    factory(api);
    logger.info({ filePath }, 'Plugin loaded successfully');
  } catch (err) {
    logger.error({ filePath, err }, 'Failed to load plugin');
  }
}

export async function loadPlugins(extraDirs: string[] = []): Promise<void> {
  const defaultDirs = [
    join(homedir(), '.pi', 'agent', 'extensions'),
    resolve(process.cwd(), '.pi', 'extensions'),
  ];

  const dirs = [...defaultDirs, ...extraDirs];

  for (const dir of dirs) {
    const paths = discoverPluginPaths(dir);

    for (const filePath of paths) {
      await loadPluginFile(filePath);
    }
  }

  logger.info({ dirsScanned: dirs.length }, 'Plugin discovery complete');
}
