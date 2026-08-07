import { describe, expect, it } from "vitest";

import {
  KIMI_BUILTIN_WEB_SEARCH,
  rewriteMoonshotRequestBody,
  rewriteToolsForKimiBuiltinSearch,
} from "./builtin-web-search";

describe("rewriteToolsForKimiBuiltinSearch", () => {
  it("converts $web_search function tools to builtin_function", () => {
    const tools = [
      {
        type: "function",
        function: {
          name: KIMI_BUILTIN_WEB_SEARCH,
          description: "search",
          parameters: { type: "object" },
        },
      },
      {
        type: "function",
        function: {
          name: "get_fixtures",
          parameters: { type: "object" },
        },
      },
    ];

    expect(rewriteToolsForKimiBuiltinSearch(tools)).toEqual([
      {
        type: "builtin_function",
        function: { name: KIMI_BUILTIN_WEB_SEARCH },
      },
      {
        type: "function",
        function: {
          name: "get_fixtures",
          parameters: { type: "object" },
        },
      },
    ]);
  });

  it("also rewrites legacy web_search names and dedupes", () => {
    const tools = [
      {
        type: "function",
        function: { name: "web_search", parameters: { type: "object" } },
      },
      {
        type: "function",
        function: {
          name: KIMI_BUILTIN_WEB_SEARCH,
          parameters: { type: "object" },
        },
      },
    ];

    expect(rewriteToolsForKimiBuiltinSearch(tools)).toEqual([
      {
        type: "builtin_function",
        function: { name: KIMI_BUILTIN_WEB_SEARCH },
      },
    ]);
  });
});

describe("rewriteMoonshotRequestBody", () => {
  it("rewrites tools inside a chat completions body", () => {
    const body = JSON.stringify({
      model: "kimi-k3",
      tools: [
        {
          type: "function",
          function: {
            name: "$web_search",
            parameters: { type: "object" },
          },
        },
      ],
    });

    expect(JSON.parse(rewriteMoonshotRequestBody(body))).toEqual({
      model: "kimi-k3",
      tools: [
        {
          type: "builtin_function",
          function: { name: "$web_search" },
        },
      ],
    });
  });

  it("leaves non-json bodies alone", () => {
    expect(rewriteMoonshotRequestBody("not-json")).toBe("not-json");
  });
});
