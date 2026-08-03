import "server-only";

import {
  enrichFplSearchQuery,
  parseDuckDuckGoHtml,
  type WebSearchResult,
} from "./web-search-shared";

export type WebSearchResponse = {
  query: string;
  provider: "tavily" | "duckduckgo";
  results: WebSearchResult[];
};

export { enrichFplSearchQuery, parseDuckDuckGoHtml } from "./web-search-shared";

async function searchWithTavily(
  query: string,
  limit: number,
  apiKey: string,
): Promise<WebSearchResponse> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: limit,
      topic: "news",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed (${response.status})`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  const results = (data.results ?? [])
    .map((item) => ({
      title: (item.title ?? "").trim(),
      url: (item.url ?? "").trim(),
      snippet: (item.content ?? "").trim(),
    }))
    .filter((item) => item.title && item.url)
    .slice(0, limit);

  return { query, provider: "tavily", results };
}

async function searchWithDuckDuckGo(
  query: string,
  limit: number,
): Promise<WebSearchResponse> {
  const body = new URLSearchParams({ q: query, b: "" });
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
      "User-Agent": "fpl-assistant/1.0",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed (${response.status})`);
  }

  const html = await response.text();
  return {
    query,
    provider: "duckduckgo",
    results: parseDuckDuckGoHtml(html, limit),
  };
}

export async function searchFplWeb(
  rawQuery: string,
  limit = 5,
): Promise<WebSearchResponse | { error: string }> {
  const query = enrichFplSearchQuery(rawQuery);
  const cappedLimit = Math.min(Math.max(limit, 1), 8);
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  try {
    if (tavilyKey) {
      try {
        return await searchWithTavily(query, cappedLimit, tavilyKey);
      } catch {
        // Fall back to the keyless provider if Tavily is misconfigured/unavailable.
      }
    }
    const result = await searchWithDuckDuckGo(query, cappedLimit);
    if (result.results.length === 0) {
      return {
        error: `No web results for "${query}". Try a more specific player, team, or manager query.`,
      };
    }
    return result;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unexpected web search failure.",
    };
  }
}
