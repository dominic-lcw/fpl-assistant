import "server-only";

import {
  buildMoonshotWebSearchFiberBody,
  enrichFplSearchQuery,
  extractMoonshotFiberContent,
} from "./web-search-shared";

const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";
const WEB_SEARCH_FORMULA_URI = "moonshot/web-search:latest";

export type MoonshotWebSearchResponse = {
  query: string;
  provider: "moonshot";
  /** Plain or Moonshot-encrypted tool payload for the model to consume. */
  content: string;
};

export {
  buildMoonshotWebSearchFiberBody,
  enrichFplSearchQuery,
  extractMoonshotFiberContent,
} from "./web-search-shared";

function moonshotBaseUrl(): string {
  return (
    process.env.MOONSHOT_BASE_URL?.trim().replace(/\/$/, "") ||
    DEFAULT_MOONSHOT_BASE_URL
  );
}

/**
 * Run Moonshot's official Formula web-search tool.
 * @see https://platform.kimi.ai/docs/guide/use-official-tools
 */
export async function searchFplWeb(
  rawQuery: string,
): Promise<MoonshotWebSearchResponse | { error: string }> {
  const query = enrichFplSearchQuery(rawQuery);
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();
  if (!apiKey) {
    return { error: "Missing MOONSHOT_API_KEY for Moonshot web search." };
  }

  try {
    const response = await fetch(
      `${moonshotBaseUrl()}/formulas/${WEB_SEARCH_FORMULA_URI}/fibers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildMoonshotWebSearchFiberBody(query)),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        error: `Moonshot web search failed (${response.status})${
          detail ? `: ${detail.slice(0, 240)}` : ""
        }`,
      };
    }

    const fiber = (await response.json()) as {
      status?: string;
      context?: {
        output?: unknown;
        encrypted_output?: unknown;
      };
      error?: unknown;
    };

    return {
      query,
      provider: "moonshot",
      content: extractMoonshotFiberContent(fiber),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unexpected Moonshot web search failure.",
    };
  }
}
