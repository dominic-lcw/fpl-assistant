const FPL_HINT =
  /\b(fpl|fantasy|premier\s*league|injury|injured|doubt|lineup|minutes|price|captain|transfer|gameweek|gw\d+)\b/i;

export const WEB_SEARCH_TOOL_NAME = "web_search";

export function enrichFplSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "Fantasy Premier League";
  if (FPL_HINT.test(trimmed)) return trimmed;
  return `${trimmed} Fantasy Premier League`;
}

export function buildMoonshotWebSearchFiberBody(query: string): {
  name: string;
  arguments: string;
} {
  return {
    name: WEB_SEARCH_TOOL_NAME,
    arguments: JSON.stringify({ query }),
  };
}

export function extractMoonshotFiberContent(fiber: {
  status?: string;
  context?: {
    output?: unknown;
    encrypted_output?: unknown;
  };
  error?: unknown;
}): string {
  if (fiber.status && fiber.status !== "succeeded") {
    throw new Error(
      `Moonshot web search fiber status: ${fiber.status}${
        fiber.error != null ? ` (${String(fiber.error)})` : ""
      }`,
    );
  }

  const encrypted = fiber.context?.encrypted_output;
  if (typeof encrypted === "string" && encrypted.trim()) {
    return encrypted;
  }

  const output = fiber.context?.output;
  if (typeof output === "string" && output.trim()) {
    return output;
  }
  if (output != null) {
    return JSON.stringify(output);
  }

  throw new Error("Moonshot web search returned an empty fiber result");
}
