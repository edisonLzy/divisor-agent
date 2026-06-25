import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";

interface AllowlistFile {
  allow: string[];
  deny: string[];
}

const DEFAULT_FILE: AllowlistFile = { allow: [], deny: [] };
const FILE_PATH = () => join(app.getPath("home"), ".divisor-agent", "browser-allowlist.json");

let cache: AllowlistFile | null = null;

async function load(): Promise<AllowlistFile> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE_PATH(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AllowlistFile>;
    cache = {
      allow: Array.isArray(parsed.allow) ? parsed.allow : [],
      deny: Array.isArray(parsed.deny) ? parsed.deny : [],
    };
  } catch {
    cache = { ...DEFAULT_FILE };
  }
  return cache;
}

export class BrowserAllowlist {
  async isAllowed(host: string): Promise<boolean> {
    const list = await load();
    if (list.deny.some((pattern) => matchHost(pattern, host))) return false;
    if (list.allow.length === 0) return true;
    return list.allow.some((pattern) => matchHost(pattern, host));
  }

  async update(patch: Partial<AllowlistFile>): Promise<AllowlistFile> {
    const next: AllowlistFile = {
      allow: patch.allow ?? (await load()).allow,
      deny: patch.deny ?? (await load()).deny,
    };
    cache = next;
    await mkdir(dirname(FILE_PATH()), { recursive: true });
    await writeFile(FILE_PATH(), JSON.stringify(next, null, 2), "utf-8");
    return next;
  }
}

function matchHost(pattern: string, host: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix);
  }
  return false;
}