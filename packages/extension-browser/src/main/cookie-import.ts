import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { safeStorage, session } from "electron";

import type { BrowserProfile, DetectedChromiumProfile } from "../common/types";

interface ChromiumRoot {
  browser: string;
  path: string;
}

export function detectChromiumProfiles(): DetectedChromiumProfile[] {
  const roots = chromiumRoots().filter((root) => existsSync(root.path));
  const detected: DetectedChromiumProfile[] = [];
  for (const root of roots) {
    const localStatePath = join(root.path, "Local State");
    let infoCache: Record<string, { name?: string }> = {};
    try {
      const state = JSON.parse(readFileSync(localStatePath, "utf8"));
      infoCache = state?.profile?.info_cache ?? {};
    } catch {
      // A browser can still have a usable Default profile without Local State metadata.
    }
    const names = new Set(["Default", ...Object.keys(infoCache)]);
    for (const name of names) {
      const cookiePath = join(root.path, name, "Network", "Cookies");
      const legacyCookiePath = join(root.path, name, "Cookies");
      const resolvedCookiePath = existsSync(cookiePath)
        ? cookiePath
        : existsSync(legacyCookiePath)
          ? legacyCookiePath
          : null;
      if (!resolvedCookiePath) continue;
      detected.push({
        browser: root.browser,
        cookiePath: resolvedCookiePath,
        id: `${root.browser}:${name}:${resolvedCookiePath}`,
        label: `${root.browser} — ${infoCache[name]?.name ?? name}`,
        localStatePath,
      });
    }
  }
  return detected;
}

export async function importChromiumCookies(
  source: DetectedChromiumProfile,
  target: BrowserProfile,
): Promise<number> {
  const temporaryDirectory = mkdtempSync(join(appTempDirectory(), "divisor-browser-cookies-"));
  const temporaryDatabase = join(temporaryDirectory, basename(source.cookiePath));
  copyFileSync(source.cookiePath, temporaryDatabase);
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(source.cookiePath + suffix)) {
      copyFileSync(source.cookiePath + suffix, temporaryDatabase + suffix);
    }
  }
  const database = new DatabaseSync(temporaryDatabase, { readOnly: true });
  let imported = 0;
  try {
    const rows = database
      .prepare(
        "SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite FROM cookies",
      )
      .all() as Array<Record<string, unknown>>;
    const targetSession = session.fromPartition(target.partition);
    for (const row of rows) {
      const domain = String(row.host_key ?? "");
      const name = String(row.name ?? "");
      if (!domain || !name) continue;
      const value = decryptCookieValue(row, source);
      if (value === null) continue;
      const secure = Number(row.is_secure ?? 0) === 1;
      const host = domain.replace(/^\./, "");
      const cookie: Electron.CookiesSetDetails = {
        domain,
        httpOnly: Number(row.is_httponly ?? 0) === 1,
        name,
        path: String(row.path ?? "/"),
        sameSite: toSameSite(Number(row.samesite ?? -1)),
        secure,
        url: `${secure ? "https" : "http"}://${host}${String(row.path ?? "/")}`,
        value,
      };
      const expirationDate = chromeExpirationToUnix(row.expires_utc);
      if (expirationDate) cookie.expirationDate = expirationDate;
      try {
        await targetSession.cookies.set(cookie);
        imported++;
      } catch {
        // Skip malformed or policy-rejected cookies without exposing their values.
      }
    }
    await targetSession.cookies.flushStore();
    return imported;
  } finally {
    database.close();
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function decryptCookieValue(
  row: Record<string, unknown>,
  source: DetectedChromiumProfile,
): string | null {
  const plain = String(row.value ?? "");
  if (plain) return plain;
  const encrypted = Buffer.isBuffer(row.encrypted_value)
    ? row.encrypted_value
    : Buffer.from((row.encrypted_value as Uint8Array | undefined) ?? []);
  if (!encrypted.length) return "";
  try {
    if (process.platform === "darwin" && encrypted.subarray(0, 3).toString() === "v10") {
      const password = execFileSync(
        "security",
        ["find-generic-password", "-w", "-s", `${source.browser} Safe Storage`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
      const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
      return stripHostHash(
        Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]),
        String(row.host_key ?? ""),
      ).toString();
    }
    if (process.platform === "win32" && /^v1[01]$/.test(encrypted.subarray(0, 3).toString())) {
      const key = readWindowsMasterKey(source.localStatePath);
      const nonce = encrypted.subarray(3, 15);
      const body = encrypted.subarray(15, -16);
      const tag = encrypted.subarray(-16);
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString();
    }
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

function readWindowsMasterKey(localStatePath: string): Buffer {
  const state = JSON.parse(readFileSync(localStatePath, "utf8"));
  const encryptedKey = Buffer.from(String(state?.os_crypt?.encrypted_key ?? ""), "base64");
  const dpapiPayload =
    encryptedKey.subarray(0, 5).toString() === "DPAPI" ? encryptedKey.subarray(5) : encryptedKey;
  const script = [
    "$bytes=[Convert]::FromBase64String($args[0]);",
    "$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);",
    "[Convert]::ToBase64String($plain)",
  ].join("");
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script, dpapiPayload.toString("base64")],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  return Buffer.from(output, "base64");
}

function stripHostHash(value: Buffer, host: string) {
  if (value.length < 32) return value;
  const expected = createHash("sha256").update(host).digest();
  return value.subarray(0, 32).equals(expected) ? value.subarray(32) : value;
}

function appTempDirectory() {
  return process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? homedir();
}

function chromiumRoots(): ChromiumRoot[] {
  const home = homedir();
  if (process.platform === "darwin") {
    const base = join(home, "Library", "Application Support");
    return [
      { browser: "Chrome", path: join(base, "Google", "Chrome") },
      { browser: "Microsoft Edge", path: join(base, "Microsoft Edge") },
      { browser: "Brave", path: join(base, "BraveSoftware", "Brave-Browser") },
      { browser: "Arc", path: join(base, "Arc", "User Data") },
    ];
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      { browser: "Chrome", path: join(local, "Google", "Chrome", "User Data") },
      { browser: "Microsoft Edge", path: join(local, "Microsoft", "Edge", "User Data") },
      { browser: "Brave", path: join(local, "BraveSoftware", "Brave-Browser", "User Data") },
      { browser: "Arc", path: join(local, "TheBrowserCompany", "Arc", "User Data") },
    ];
  }
  const config = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return [
    { browser: "Chrome", path: join(config, "google-chrome") },
    { browser: "Microsoft Edge", path: join(config, "microsoft-edge") },
    { browser: "Brave", path: join(config, "BraveSoftware", "Brave-Browser") },
  ];
}

function chromeExpirationToUnix(value: unknown): number | undefined {
  const chromeMicros = Number(value ?? 0);
  if (!Number.isFinite(chromeMicros) || chromeMicros <= 0) return undefined;
  const unixSeconds = chromeMicros / 1_000_000 - 11_644_473_600;
  return unixSeconds > Date.now() / 1000 ? unixSeconds : undefined;
}

function toSameSite(value: number): Electron.Cookie["sameSite"] {
  if (value === 1) return "lax";
  if (value === 2) return "strict";
  if (value === 0) return "no_restriction";
  return "unspecified";
}
