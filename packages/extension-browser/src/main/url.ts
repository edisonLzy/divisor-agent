const DEFAULT_URL = "https://www.google.com";

export class BrowserOperationError extends Error {
  constructor(
    readonly code:
      | "browser_invalid_url"
      | "browser_navigation_failed"
      | "browser_page_closed"
      | "browser_read_failed"
      | "browser_stale_ref",
    message: string,
  ) {
    super(message);
  }
}

export function normalizeBrowserUrl(raw = DEFAULT_URL): string {
  const value = raw.trim();
  if (!value) return DEFAULT_URL;
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new BrowserOperationError("browser_invalid_url", `Invalid browser URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BrowserOperationError(
      "browser_invalid_url",
      `Unsupported browser URL protocol: ${parsed.protocol}`,
    );
  }
  return parsed.toString();
}
