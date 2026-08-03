export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const FPL_HINT =
  /\b(fpl|fantasy|premier\s*league|injury|injured|doubt|lineup|minutes|price|captain|transfer|gameweek|gw\d+)\b/i;

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function rssField(block: string, tag: string): string {
  const cdata = block.match(
    new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"),
  );
  if (cdata?.[1] != null) return stripTags(cdata[1]);
  const plain = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return plain?.[1] != null ? stripTags(plain[1]) : "";
}

export function enrichFplSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "Fantasy Premier League";
  if (FPL_HINT.test(trimmed)) return trimmed;
  return `${trimmed} Fantasy Premier League`;
}

export function parseDuckDuckGoHtml(
  html: string,
  limit: number,
): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const resultBlocks = html.split(/class="result__body"/i).slice(1);

  for (const block of resultBlocks) {
    const linkMatch = block.match(
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkMatch) continue;

    const url = decodeHtmlEntities(linkMatch[1] ?? "").trim();
    const title = stripTags(linkMatch[2] ?? "");
    if (!url || !title || url.startsWith("javascript:")) continue;

    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i,
    );
    const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? "") : "";

    results.push({ title, url, snippet });
    if (results.length >= limit) break;
  }

  return results;
}

export function parseRssItems(xml: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  for (const item of items) {
    const title = rssField(item, "title");
    const url = rssField(item, "link");
    const snippet =
      rssField(item, "description") || rssField(item, "content:encoded");
    if (!title || !url) continue;
    results.push({
      title,
      url,
      snippet: snippet.slice(0, 320),
    });
    if (results.length >= limit) break;
  }

  return results;
}

export function parseWikipediaSearchJson(
  payload: unknown,
  limit: number,
): WebSearchResult[] {
  const data = payload as {
    query?: {
      search?: Array<{ title?: string; snippet?: string; pageid?: number }>;
    };
  };

  return (data.query?.search ?? [])
    .map((hit) => {
      const title = (hit.title ?? "").trim();
      if (!title) return null;
      return {
        title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
          title.replace(/ /g, "_"),
        )}`,
        snippet: stripTags(hit.snippet ?? ""),
      } satisfies WebSearchResult;
    })
    .filter((item): item is WebSearchResult => item != null)
    .slice(0, limit);
}
