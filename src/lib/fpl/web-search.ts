import "server-only";

import {
  enrichFplSearchQuery,
  parseDuckDuckGoHtml,
  parseRssItems,
  parseWikipediaSearchJson,
  type WebSearchResult,
} from "./web-search-shared";

export type WebSearchProvider =
  | "tavily"
  | "duckduckgo"
  | "google-news"
  | "wikipedia";

export type WebSearchResponse = {
  query: string;
  provider: WebSearchProvider;
  results: WebSearchResult[];
};

export {
  enrichFplSearchQuery,
  parseDuckDuckGoHtml,
  parseRssItems,
  parseWikipediaSearchJson,
} from "./web-search-shared";

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

  if (results.length === 0) {
    throw new Error("Tavily returned no results");
  }

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
  if (/anomaly|captcha|challenge/i.test(html)) {
    throw new Error("DuckDuckGo challenged the request");
  }

  const results = parseDuckDuckGoHtml(html, limit);
  if (results.length === 0) {
    throw new Error("DuckDuckGo returned no results");
  }

  return { query, provider: "duckduckgo", results };
}

async function searchWithGoogleNews(
  query: string,
  limit: number,
): Promise<WebSearchResponse> {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-GB");
  url.searchParams.set("gl", "GB");
  url.searchParams.set("ceid", "GB:en");

  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "fpl-assistant/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google News search failed (${response.status})`);
  }

  const xml = await response.text();
  const results = parseRssItems(xml, limit);
  if (results.length === 0) {
    throw new Error("Google News returned no results");
  }

  return { query, provider: "google-news", results };
}

async function searchWithWikipedia(
  query: string,
  limit: number,
): Promise<WebSearchResponse> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "fpl-assistant/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Wikipedia search failed (${response.status})`);
  }

  const results = parseWikipediaSearchJson(await response.json(), limit);
  if (results.length === 0) {
    throw new Error("Wikipedia returned no results");
  }

  return { query, provider: "wikipedia", results };
}

export async function searchFplWeb(
  rawQuery: string,
  limit = 5,
): Promise<WebSearchResponse | { error: string }> {
  const query = enrichFplSearchQuery(rawQuery);
  const cappedLimit = Math.min(Math.max(limit, 1), 8);
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  const providers: Array<() => Promise<WebSearchResponse>> = [];
  if (tavilyKey) {
    providers.push(() => searchWithTavily(query, cappedLimit, tavilyKey));
  }
  providers.push(
    () => searchWithDuckDuckGo(query, cappedLimit),
    () => searchWithGoogleNews(query, cappedLimit),
    () => searchWithWikipedia(query, cappedLimit),
  );

  const errors: string[] = [];
  for (const run of providers) {
    try {
      return await run();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown error");
    }
  }

  return {
    error: `No web results for "${query}". Tried: ${errors.join("; ")}`,
  };
}
