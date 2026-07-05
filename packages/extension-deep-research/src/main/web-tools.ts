import type { MainExtensionContext } from "@divisor-agent/extension-core/main";
import { Type } from "@earendil-works/pi-ai";

import { WEB_FETCH_TOOL_NAME, WEB_SEARCH_TOOL_NAME } from "../common/types";
import { webFetch, webSearch } from "./web";

/** Register the shared `web/search` and `web/fetch` tools used by sub-researchers. */
export function registerWebTools(ctx: MainExtensionContext) {
  ctx.tools.register({
    name: WEB_SEARCH_TOOL_NAME,
    label: "Web Search",
    description: "Search the web and return ranked results with titles, URLs and snippets.",
    executionMode: "parallel",
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
      maxResults: Type.Optional(
        Type.Number({ description: "Max results (default 5).", maximum: 10 }),
      ),
    }),
    async execute(_toolCallId, args) {
      const query = String((args as { query?: unknown }).query ?? "").trim();
      if (!query) throw new Error("web/search requires a non-empty query.");
      const maxResults = Number((args as { maxResults?: unknown }).maxResults ?? 5) || 5;
      const results = await webSearch(query, maxResults);
      const text = results.length
        ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n")
        : "No results found.";
      return { content: [{ type: "text", text }], details: { results } };
    },
  });

  ctx.tools.register({
    name: WEB_FETCH_TOOL_NAME,
    label: "Web Fetch",
    description: "Fetch a URL and return its main text content as plain text.",
    executionMode: "parallel",
    parameters: Type.Object({
      url: Type.String({ description: "The absolute http(s) URL to fetch." }),
    }),
    async execute(_toolCallId, args) {
      const url = String((args as { url?: unknown }).url ?? "").trim();
      const text = await webFetch(url);
      return { content: [{ type: "text", text }], details: { url } };
    },
  });
}
