import { createMoonshotAI, type MoonshotAIProvider } from "@ai-sdk/moonshotai";

import { rewriteMoonshotRequestBody } from "./builtin-web-search";

/**
 * Moonshot/Kimi provider that rewrites `$web_search` to Kimi's
 * `builtin_function` form before each request.
 */
export function createKimiProvider(): MoonshotAIProvider {
  return createMoonshotAI({
    fetch: async (input, init) => {
      if (init?.body && typeof init.body === "string") {
        init = {
          ...init,
          body: rewriteMoonshotRequestBody(init.body),
        };
      }
      return globalThis.fetch(input, init);
    },
  });
}
