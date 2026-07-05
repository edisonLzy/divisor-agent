/**
 * Web search + fetch primitives for Deep Research (main-process only).
 *
 * Search uses the Tavily API when `TAVILY_API_KEY` is set. Fetch uses the
 * runtime's global `fetch` and strips HTML to plain text. Both degrade
 * gracefully with an actionable message when unavailable, so the agent can
 * still reason about the gap instead of hard-failing.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/**
 * Run a web search via Tavily. Throws a descriptive error when the API key is
 * missing so the caller can surface it to the user.
 */
export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "web/search requires a TAVILY_API_KEY environment variable. Set it before launching the app to enable deep research search.",
    );
  }

  const response = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_raw_content: true,
      search_depth: "advanced",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tavily search failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>;
  };

  return (data.results ?? []).map((r) => ({
    title: r.title ?? r.url ?? "Untitled",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 500),
    content: r.raw_content ?? r.content ?? undefined,
  }));
}

/**
 * Fetch a single URL and return its main text content as plain text (HTML tags
 * stripped, entities decoded, whitespace collapsed).
 */
export async function webFetch(url: string, maxChars = 12000): Promise<string> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error(`web/fetch received an invalid URL: ${url}`);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`web/fetch only supports http(s) URLs, got: ${target.protocol}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(target.toString(), {
      headers: { "user-agent": "DivisorAgent-DeepResearch/0.1" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`web/fetch failed (${response.status}) for ${url}`);
    }
    const html = await response.text();
    return htmlToText(html).slice(0, maxChars);
  } finally {
    clearTimeout(timeout);
  }
}

/** Minimal HTML → text: drop script/style, strip tags, decode common entities. */
export function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  return decoded
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
