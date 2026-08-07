import { dynamicTool, jsonSchema } from "ai";

/** Kimi built-in web search tool name (must use builtin_function type). */
export const KIMI_BUILTIN_WEB_SEARCH = "$web_search";

type OpenAICompatTool = {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: unknown;
    strict?: unknown;
  };
};

/**
 * Rewrite AI SDK function tools so `$web_search` is sent as Kimi's
 * `builtin_function` (no parameter schema). Echo-args execution stays in the
 * SDK tool loop.
 *
 * @see https://platform.kimi.ai/docs/guide/use-web-search
 */
export function rewriteToolsForKimiBuiltinSearch(
  tools: unknown,
): OpenAICompatTool[] | unknown {
  if (!Array.isArray(tools)) return tools;

  const rewritten: OpenAICompatTool[] = [];
  let sawBuiltinSearch = false;

  for (const tool of tools) {
    const name =
      tool &&
      typeof tool === "object" &&
      "function" in tool &&
      tool.function &&
      typeof tool.function === "object" &&
      "name" in tool.function
        ? String((tool.function as { name?: unknown }).name ?? "")
        : "";

    if (name === KIMI_BUILTIN_WEB_SEARCH || name === "web_search") {
      if (sawBuiltinSearch) continue;
      sawBuiltinSearch = true;
      rewritten.push({
        type: "builtin_function",
        function: { name: KIMI_BUILTIN_WEB_SEARCH },
      });
      continue;
    }

    rewritten.push(tool as OpenAICompatTool);
  }

  return rewritten;
}

/** Parse/rewrite a Moonshot chat-completions JSON body string when possible. */
export function rewriteMoonshotRequestBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { tools?: unknown };
    if (!Array.isArray(parsed.tools)) return body;
    parsed.tools = rewriteToolsForKimiBuiltinSearch(parsed.tools);
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

/**
 * Kimi `$web_search` tool: execute by echoing model arguments back so Kimi
 * runs the built-in search.
 */
export function createKimiBuiltinWebSearchTool() {
  return {
    [KIMI_BUILTIN_WEB_SEARCH]: dynamicTool({
      description:
        "Kimi built-in web search for Fantasy Premier League news and context about players, teams, club managers, injuries, lineups, and FPL discussion. Use for time-sensitive news that is not in the FPL API. Do not use for live points, prices, ownership, fixtures, or manager ranks.",
      inputSchema: jsonSchema<Record<string, unknown>>({
        type: "object",
        additionalProperties: true,
      }),
      execute: async (input) => input,
    }),
  };
}
