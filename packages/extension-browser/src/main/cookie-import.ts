import { execFileSync } from "node:child_process";
import { createDecipheriv, pbkdf2Sync, randomUUID } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { app, session } from "electron";

import type { BrowserProfile, DetectedChromiumProfile } from "../common/types";

// ---------------------------------------------------------------------------
// Diagnostic logging
// ---------------------------------------------------------------------------

let _diagLog: string | null = null;
function getDiagLogPath(): string {
  if (!_diagLog) {
    try {
      _diagLog = join(app.getPath("userData"), "cookie-import-diag.log");
    } catch {
      _diagLog = join(process.env.TMPDIR ?? homedir(), "divisor-cookie-import-diag.log");
    }
  }
  return _diagLog;
}

function diag(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(getDiagLogPath(), line);
  } catch {
    /* best-effort */
  }
}

const COOKIE_IMPORT_ERROR_SUMMARY_MAX_CHARS = 180;
const COOKIE_IMPORT_ERROR_SCAN_MAX_CHARS = 512;

export function summarizeCookieImportError(err: unknown): string {
  const raw = err instanceof Error && err.message ? err.message : String(err);
  let summary = "";
  let previousWasWhitespace = false;
  const scanLimit = Math.min(raw.length, COOKIE_IMPORT_ERROR_SCAN_MAX_CHARS);
  for (let index = 0; index < scanLimit; index += 1) {
    const code = raw.charCodeAt(index);
    if (code === 32 || (code >= 9 && code <= 13)) {
      if (summary.length > 0 && !previousWasWhitespace) summary += " ";
      previousWasWhitespace = true;
      continue;
    }
    summary += raw.charAt(index);
    if (summary.length >= COOKIE_IMPORT_ERROR_SUMMARY_MAX_CHARS) {
      return summary.slice(0, COOKIE_IMPORT_ERROR_SUMMARY_MAX_CHARS);
    }
    previousWasWhitespace = false;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Browser detection (Chromium only)
// ---------------------------------------------------------------------------

interface ChromiumRoot {
  browser: string;
  path: string;
  keychainService: string;
  keychainAccount: string;
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

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

export async function importChromiumCookies(
  source: DetectedChromiumProfile,
  target: BrowserProfile,
): Promise<{ imported: number; total: number; skipped: number; domains: string[] }> {
  diag(`importChromiumCookies: source=${source.browser} partition="${target.partition}"`);

  if (!existsSync(source.cookiePath)) {
    diag(`  cookies DB not found: ${source.cookiePath}`);
    throw new Error(`${source.browser} cookies database not found.`);
  }

  // Copy the source DB to a temp location to avoid lock contention
  const tmpDir = mkdtempSync(join(appTempDirectory(), "divisor-cookie-import-"));
  const tmpCookiesPath = join(tmpDir, "Cookies");

  try {
    copyFileSync(source.cookiePath, tmpCookiesPath);
    for (const suffix of ["-wal", "-shm"] as const) {
      const sidecar = source.cookiePath + suffix;
      if (existsSync(sidecar)) {
        try {
          copyFileSync(sidecar, tmpCookiesPath + suffix);
        } catch {
          /* best-effort */
        }
      }
    }
  } catch {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Could not copy ${source.browser} cookies database. Try closing ${source.browser} first.`,
    );
  }

  // Get encryption key
  const sourceKey = getEncryptionKey(source);
  if (!sourceKey) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Could not access ${source.browser} encryption key. The OS may have denied access.`,
    );
  }

  // Set up staging DB
  const targetSession = session.fromPartition(target.partition);
  await targetSession.cookies.flushStore();

  const partitionName = target.partition.replace("persist:", "");
  const liveCookiesPath = join(app.getPath("userData"), "Partitions", partitionName, "Cookies");

  // Ensure the partition's Cookies DB exists
  if (!existsSync(liveCookiesPath)) {
    try {
      await targetSession.cookies.set({ url: "https://localhost", name: "__init", value: "1" });
      await targetSession.cookies.remove("https://localhost", "__init");
      await targetSession.cookies.flushStore();
    } catch {
      // ignore
    }
  }

  if (!existsSync(liveCookiesPath)) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Target cookie database not found. Open a browser tab first.");
  }

  const stagingDir = join(app.getPath("userData"), "cookie-import-staging");
  const partitionSegment = partitionName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const stagingCookiesPath = join(
    stagingDir,
    `Cookies-${partitionSegment}-${Date.now()}-${randomUUID()}`,
  );

  try {
    mkdirSync(stagingDir, { recursive: true });
    copyFileSync(liveCookiesPath, stagingCookiesPath);
  } catch {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Could not create staging cookie database.");
  }

  let sourceDb: InstanceType<typeof DatabaseSync> | null = null;
  let stagingDb: InstanceType<typeof DatabaseSync> | null = null;

  try {
    sourceDb = new DatabaseSync(tmpCookiesPath, { readOnly: true, readBigInts: true });
    stagingDb = new DatabaseSync(stagingCookiesPath);

    // Discover target schema
    type ColumnInfo = {
      name: string;
      type?: string;
      notnull?: number | bigint;
      dflt_value?: unknown;
    };
    const targetColumnInfo = stagingDb.prepare("PRAGMA table_info(cookies)").all() as ColumnInfo[];
    const targetCols = targetColumnInfo.map((r) => r.name);
    const colList = targetCols.join(", ");

    stagingDb.exec("DELETE FROM cookies");

    const sourceRows = sourceDb.prepare("SELECT * FROM cookies ORDER BY rowid").all() as Record<
      string,
      unknown
    >[];
    sourceDb.close();
    sourceDb = null;

    diag(`  source has ${sourceRows.length} cookies`);

    if (sourceRows.length === 0) {
      stagingDb.close();
      stagingDb = null;
      rmSync(tmpDir, { recursive: true, force: true });
      try {
        unlinkSync(stagingCookiesPath);
      } catch {
        /* ignore */
      }
      throw new Error(`No cookies found in ${source.browser}.`);
    }

    // Google integrity cookies to skip
    const INTEGRITY_COOKIE_NAMES = new Set([
      "SIDCC",
      "__Secure-1PSIDCC",
      "__Secure-3PSIDCC",
      "__Secure-STRP",
      "AEC",
    ]);

    function isIntegrityCookie(name: string, domain: string): boolean {
      if (!INTEGRITY_COOKIE_NAMES.has(name)) return false;
      const d = domain.startsWith(".") ? domain.slice(1) : domain;
      return d === "google.com" || d.endsWith(".google.com");
    }

    let imported = 0;
    let skipped = 0;
    let integritySkipped = 0;
    let memoryLoaded = 0;
    let memoryFailed = 0;
    const domainSet = new Set<string>();

    type DecryptedCookie = {
      decryptedValue: Buffer;
      value: string;
      domain: string;
      name: string;
      path: string;
      secure: boolean;
      httpOnly: boolean;
      sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
      expirationDate: number | undefined;
    };

    const decryptedCookies: DecryptedCookie[] = [];

    const placeholders = targetCols.map(() => "?").join(", ");
    const insertStmt = stagingDb.prepare(
      `INSERT OR REPLACE INTO cookies (${colList}) VALUES (${placeholders})`,
    );

    stagingDb.exec("BEGIN TRANSACTION");

    for (const sourceRow of sourceRows) {
      const encRaw = sourceRow.encrypted_value;
      const encBuf = encRaw instanceof Uint8Array ? Buffer.from(encRaw) : null;
      const plainRaw = sourceRow.value;

      let decryptedValue: Buffer;
      if (encBuf && encBuf.length > 0) {
        const raw = decryptCookieValueRaw(encBuf, sourceKey);
        if (!raw) {
          skipped++;
          continue;
        }
        decryptedValue = raw;
      } else if (plainRaw instanceof Uint8Array) {
        decryptedValue = Buffer.from(plainRaw);
      } else if (typeof plainRaw === "string") {
        decryptedValue = Buffer.from(plainRaw, "latin1");
      } else {
        decryptedValue = Buffer.alloc(0);
      }

      const domain = sourceRow.host_key as string;
      const name = sourceRow.name as string;

      if (isIntegrityCookie(name, domain)) {
        integritySkipped++;
        continue;
      }

      const cleanDomain = domain.startsWith(".") ? domain.slice(1) : domain;
      domainSet.add(cleanDomain);

      const path = sourceRow.path as string;
      const secure = sourceRow.is_secure === 1n;
      const httpOnly = sourceRow.is_httponly === 1n;
      const sameSite = chromiumSameSite(Number(sourceRow.samesite ?? 0));
      const expiresUtc = chromiumTimestampToUnix(sourceRow.expires_utc as bigint);
      const value = decryptedValue.toString("latin1");

      decryptedCookies.push({
        decryptedValue,
        value,
        domain,
        name,
        path,
        secure,
        httpOnly,
        sameSite,
        expirationDate: expiresUtc > 0 ? expiresUtc : undefined,
      });

      const params = buildChromiumCookieInsertParams(targetColumnInfo, sourceRow, decryptedValue);
      insertStmt.run(...params);
      imported++;
    }

    diag(`  skipped ${integritySkipped} Google integrity cookies (SIDCC/STRP/AEC)`);
    stagingDb.exec("COMMIT");
    stagingDb.close();
    stagingDb = null;

    rmSync(tmpDir, { recursive: true, force: true });
    diag(`  SQLite staging complete: ${imported} cookies, ${domainSet.size} domains`);

    // Clear existing cookies before loading imported ones
    await targetSession.clearStorageData({ storages: ["cookies"] });
    diag(
      `  cleared existing session cookies before loading ${decryptedCookies.length} imported cookies`,
    );

    // Load into memory via cookies.set()
    for (const cookie of decryptedCookies) {
      const url = deriveUrl(cookie.domain, cookie.secure);
      if (!url) {
        memoryFailed++;
        continue;
      }
      try {
        const isHostPrefixed = cookie.name.startsWith("__Host-");
        await targetSession.cookies.set({
          url,
          name: cookie.name,
          value: cookie.value,
          ...(isHostPrefixed ? {} : { domain: cookie.domain }),
          path: isHostPrefixed ? "/" : cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          expirationDate: cookie.expirationDate,
        });
        memoryLoaded++;
      } catch {
        memoryFailed++;
      }
    }

    diag(`  memory load: ${memoryLoaded} OK, ${memoryFailed} failed`);

    // Keep staging DB if any cookies failed to load in-memory
    if (memoryFailed > 0) {
      diag(`  staged at ${stagingCookiesPath} for ${memoryFailed} cookies that need restart`);
    } else {
      try {
        unlinkSync(stagingCookiesPath);
      } catch {
        /* best-effort */
      }
      diag(`  all cookies loaded in-memory — no restart needed`);
    }

    // Set User-Agent to match source browser
    const ua = getUserAgentForBrowser(source.browser);
    if (ua) {
      targetSession.setUserAgent(ua);
      diag(`  set UA for partition: ${ua.substring(0, 80)}...`);
    }

    return {
      imported: memoryLoaded,
      total: sourceRows.length,
      skipped: skipped + integritySkipped,
      domains: [...domainSet].sort(),
    };
  } catch (err) {
    try {
      sourceDb?.close();
    } catch {
      /* ignore */
    }
    try {
      stagingDb?.close();
    } catch {
      /* ignore */
    }
    rmSync(tmpDir, { recursive: true, force: true });
    try {
      unlinkSync(stagingCookiesPath);
    } catch {
      /* ignore */
    }
    diag(`  SQLite import failed: ${err}`);
    throw new Error(
      `Could not import cookies from ${source.browser}: ${summarizeCookieImportError(err)}. Details were written to ${getDiagLogPath()}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 1003;
const PBKDF2_KEY_LENGTH = 16;
const PBKDF2_SALT = "saltysalt";
const CHROMIUM_COOKIE_HMAC_LEN = 32;

type EncryptionKeyResult = {
  key: Buffer;
  mode: "aes-128-cbc" | "aes-256-gcm";
  fallbackKey?: Buffer;
};

function getEncryptionKey(source: DetectedChromiumProfile): EncryptionKeyResult | null {
  if (process.platform === "darwin") {
    return getMacEncryptionKey(source);
  }
  if (process.platform === "linux") {
    return getLinuxEncryptionKey(source);
  }
  if (process.platform === "win32") {
    return getWindowsEncryptionKey(source);
  }
  return null;
}

function getMacEncryptionKey(source: DetectedChromiumProfile): EncryptionKeyResult | null {
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-w", "-s", `${source.browser} Safe Storage`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 },
    ).trim();
    return {
      key: pbkdf2Sync(raw, PBKDF2_SALT, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, "sha1"),
      mode: "aes-128-cbc",
    };
  } catch {
    return null;
  }
}

function getLinuxEncryptionKey(source: DetectedChromiumProfile): EncryptionKeyResult | null {
  const v10Key = pbkdf2Sync("peanuts", PBKDF2_SALT, 1, PBKDF2_KEY_LENGTH, "sha1");

  let keyringPassword = "";
  try {
    keyringPassword = execFileSync(
      "secret-tool",
      ["lookup", "service", `${source.browser} Safe Storage`, "account", source.browser],
      { encoding: "utf8", timeout: 5_000 },
    ).trim();
  } catch {
    try {
      const app = source.browser.toLowerCase().replaceAll(" ", "");
      keyringPassword = execFileSync("secret-tool", ["lookup", "application", app], {
        encoding: "utf8",
        timeout: 5_000,
      }).trim();
    } catch {
      diag("  Linux keyring unavailable — v11 cookies may fail to decrypt");
    }
  }

  const v11Key = pbkdf2Sync(keyringPassword, PBKDF2_SALT, 1, PBKDF2_KEY_LENGTH, "sha1");
  return { key: v11Key, mode: "aes-128-cbc", fallbackKey: v10Key };
}

function getWindowsEncryptionKey(source: DetectedChromiumProfile): EncryptionKeyResult | null {
  const localStatePath = source.localStatePath;
  if (!existsSync(localStatePath)) return null;

  try {
    const raw = readFileSync(localStatePath, "utf-8");
    const localState = JSON.parse(raw);
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
    if (typeof encryptedKeyB64 !== "string") return null;

    const encryptedKey = Buffer.from(encryptedKeyB64, "base64");
    const dpapiPrefix = Buffer.from("DPAPI", "utf-8");
    if (!encryptedKey.subarray(0, dpapiPrefix.length).equals(dpapiPrefix)) return null;

    const dpapiData = encryptedKey.subarray(dpapiPrefix.length).toString("base64");
    const script = [
      "try { Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop }",
      "catch { try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch {} };",
      "$in=[Convert]::FromBase64String([Console]::In.ReadLine());",
      "$out=[System.Security.Cryptography.ProtectedData]::Unprotect($in,$null,",
      "[System.Security.Cryptography.DataProtectionScope]::CurrentUser);",
      "[Convert]::ToBase64String($out)",
    ].join("");

    const result = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", timeout: 10_000, input: dpapiData },
    ).trim();

    return { key: Buffer.from(result, "base64"), mode: "aes-256-gcm" };
  } catch (err) {
    diag(`  Windows DPAPI key extraction failed: ${err}`);
    return null;
  }
}

function decryptCookieValueRaw(
  encryptedBuffer: Buffer,
  keyResult: EncryptionKeyResult,
): Buffer | null {
  if (!encryptedBuffer || encryptedBuffer.length === 0) return null;
  const version = encryptedBuffer.subarray(0, 3).toString("utf-8");
  if (!/^v\d\d$/.test(version)) return null;

  if (keyResult.mode === "aes-256-gcm") {
    return decryptAes256Gcm(encryptedBuffer.subarray(3), keyResult.key);
  }

  // AES-128-CBC (macOS and Linux)
  const ciphertext = encryptedBuffer.subarray(3);
  if (!ciphertext.length) return Buffer.alloc(0);

  const keysToTry =
    version === "v10" && keyResult.fallbackKey
      ? [keyResult.fallbackKey, keyResult.key]
      : [keyResult.key, ...(keyResult.fallbackKey ? [keyResult.fallbackKey] : [])];

  for (const key of keysToTry) {
    try {
      const iv = Buffer.alloc(16, " ");
      const decipher = createDecipheriv("aes-128-cbc", key, iv);
      decipher.setAutoPadding(true);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return stripHmac(decrypted);
    } catch {
      continue;
    }
  }
  return null;
}

function decryptAes256Gcm(payload: Buffer, key: Buffer): Buffer | null {
  if (payload.length < 12 + 16) return null;
  const nonce = payload.subarray(0, 12);
  const authTag = payload.subarray(-16);
  const ciphertext = payload.subarray(12, -16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return stripHmac(decrypted);
  } catch {
    return null;
  }
}

// Chromium 127+ prepends a 32-byte per-host HMAC to the cookie value
function hasHmacPrefix(buf: Buffer): boolean {
  if (buf.length <= CHROMIUM_COOKIE_HMAC_LEN) return false;
  let nonPrintable = 0;
  for (let i = 0; i < CHROMIUM_COOKIE_HMAC_LEN; i++) {
    if (buf[i] < 0x20 || buf[i] > 0x7e) nonPrintable++;
  }
  return nonPrintable >= 8;
}

function stripHmac(buf: Buffer): Buffer {
  return hasHmacPrefix(buf) ? buf.subarray(CHROMIUM_COOKIE_HMAC_LEN) : buf;
}

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

type ChromiumCookieColumnInfo = {
  name: string;
  type?: string;
  notnull?: number | bigint;
  dflt_value?: unknown;
};

function parseSqliteDefaultValue(raw: unknown, type: string): string | number | Buffer | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string")
    return typeof raw === "number" || typeof raw === "bigint" ? Number(raw) : String(raw);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NULL") return null;
  if (/^X''$/i.test(trimmed) || type.includes("BLOB")) return Buffer.alloc(0);
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (type.includes("INT")) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return trimmed;
}

function normalizeSqliteCookieValue(value: unknown): string | number | bigint | Buffer | null {
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string")
    return value;
  return String(value);
}

function isSqliteNotNull(column: ChromiumCookieColumnInfo): boolean {
  return Number(column.notnull ?? 0) !== 0;
}

function fallbackChromiumCookieColumnValue(
  column: ChromiumCookieColumnInfo,
  sourceRow: Record<string, unknown>,
): string | number | bigint | Buffer | null {
  const type = (column.type ?? "").toUpperCase();
  const defaultValue = parseSqliteDefaultValue(column.dflt_value, type);
  if (defaultValue !== null) return defaultValue;
  if (!isSqliteNotNull(column)) return null;

  switch (column.name) {
    case "value":
    case "encrypted_value":
      return Buffer.alloc(0);
    case "top_frame_site_key":
      return "";
    case "source_port":
      return -1;
    case "last_update_utc":
      return normalizeSqliteCookieValue(sourceRow.creation_utc) ?? 0;
    default:
      if (type.includes("BLOB")) return Buffer.alloc(0);
      if (type.includes("INT")) return 0;
      return "";
  }
}

function buildChromiumCookieInsertParams(
  targetColumns: ChromiumCookieColumnInfo[],
  sourceRow: Record<string, unknown>,
  decryptedValue: Buffer,
): (string | number | bigint | Buffer | null)[] {
  return targetColumns.map((column) => {
    if (column.name === "encrypted_value") return Buffer.alloc(0);
    if (column.name === "value") return decryptedValue;

    const sourceHasColumn = Object.prototype.hasOwnProperty.call(sourceRow, column.name);
    const sourceValue = sourceHasColumn ? normalizeSqliteCookieValue(sourceRow[column.name]) : null;
    if (sourceValue !== null) return sourceValue;
    if (sourceHasColumn && !isSqliteNotNull(column)) return null;

    return fallbackChromiumCookieColumnValue(column, sourceRow);
  });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function deriveUrl(domain: string, secure: boolean): string | null {
  const cleanDomain = domain.startsWith(".") ? domain.slice(1) : domain;
  if (!cleanDomain || cleanDomain.includes(" ")) return null;
  const protocol = secure ? "https" : "http";
  try {
    return new URL(`${protocol}://${cleanDomain}/`).toString();
  } catch {
    return null;
  }
}

function chromiumSameSite(raw: number): "unspecified" | "no_restriction" | "lax" | "strict" {
  switch (raw) {
    case 1:
      return "no_restriction";
    case 2:
      return "lax";
    case 3:
      return "strict";
    default:
      return "unspecified";
  }
}

const CHROMIUM_EPOCH_OFFSET = 11644473600n;

function chromiumTimestampToUnix(chromiumTs: bigint | number | string): number {
  if (!chromiumTs || chromiumTs === 0n || chromiumTs === 0 || chromiumTs === "0") return 0;
  try {
    const ts =
      typeof chromiumTs === "bigint"
        ? chromiumTs
        : BigInt(typeof chromiumTs === "number" ? Math.round(chromiumTs) : chromiumTs);
    if (ts === 0n) return 0;
    return Math.max(Number(ts / 1000000n - CHROMIUM_EPOCH_OFFSET), 0);
  } catch {
    return 0;
  }
}

function getUserAgentForBrowser(browser: string): string | null {
  if (process.platform !== "darwin") return null;
  const platform = "Macintosh; Intel Mac OS X 10_15_7";
  const chromeBase = "AppleWebKit/537.36 (KHTML, like Gecko)";

  function readBrowserVersion(appPath: string): string | null {
    try {
      return (
        execFileSync(
          "defaults",
          ["read", `${appPath}/Contents/Info`, "CFBundleShortVersionString"],
          {
            encoding: "utf-8",
            timeout: 5_000,
          },
        ).trim() || null
      );
    } catch {
      return null;
    }
  }

  const appMap: Record<string, string> = {
    Chrome: "/Applications/Google Chrome.app",
    "Microsoft Edge": "/Applications/Microsoft Edge.app",
    Brave: "/Applications/Brave Browser.app",
    Arc: "/Applications/Arc.app",
  };

  const appPath = appMap[browser];
  if (!appPath) return null;
  const v = readBrowserVersion(appPath);
  return v ? `Mozilla/5.0 (${platform}) ${chromeBase} Chrome/${v} Safari/537.36` : null;
}

function appTempDirectory() {
  return process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? homedir();
}

function chromiumRoots(): ChromiumRoot[] {
  const home = homedir();
  if (process.platform === "darwin") {
    const base = join(home, "Library", "Application Support");
    return [
      {
        browser: "Chrome",
        path: join(base, "Google", "Chrome"),
        keychainService: "Chrome Safe Storage",
        keychainAccount: "Chrome",
      },
      {
        browser: "Microsoft Edge",
        path: join(base, "Microsoft Edge"),
        keychainService: "Microsoft Edge Safe Storage",
        keychainAccount: "Microsoft Edge",
      },
      {
        browser: "Brave",
        path: join(base, "BraveSoftware", "Brave-Browser"),
        keychainService: "Brave Safe Storage",
        keychainAccount: "Brave",
      },
      {
        browser: "Arc",
        path: join(base, "Arc", "User Data"),
        keychainService: "Arc Safe Storage",
        keychainAccount: "Arc",
      },
    ];
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      {
        browser: "Chrome",
        path: join(local, "Google", "Chrome", "User Data"),
        keychainService: "Chrome Safe Storage",
        keychainAccount: "Chrome",
      },
      {
        browser: "Microsoft Edge",
        path: join(local, "Microsoft", "Edge", "User Data"),
        keychainService: "Microsoft Edge Safe Storage",
        keychainAccount: "Microsoft Edge",
      },
      {
        browser: "Brave",
        path: join(local, "BraveSoftware", "Brave-Browser", "User Data"),
        keychainService: "Brave Safe Storage",
        keychainAccount: "Brave",
      },
      {
        browser: "Arc",
        path: join(local, "TheBrowserCompany", "Arc", "User Data"),
        keychainService: "Arc Safe Storage",
        keychainAccount: "Arc",
      },
    ];
  }
  const config = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return [
    {
      browser: "Chrome",
      path: join(config, "google-chrome"),
      keychainService: "Chrome Safe Storage",
      keychainAccount: "Chrome",
    },
    {
      browser: "Microsoft Edge",
      path: join(config, "microsoft-edge"),
      keychainService: "Microsoft Edge Safe Storage",
      keychainAccount: "Microsoft Edge",
    },
    {
      browser: "Brave",
      path: join(config, "BraveSoftware", "Brave-Browser"),
      keychainService: "Brave Safe Storage",
      keychainAccount: "Brave",
    },
  ];
}
