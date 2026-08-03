import { describe, expect, it } from "vitest";

import {
  buildMoonshotWebSearchFiberBody,
  enrichFplSearchQuery,
  extractMoonshotFiberContent,
} from "./web-search-shared";

describe("enrichFplSearchQuery", () => {
  it("keeps queries that already mention FPL context", () => {
    expect(enrichFplSearchQuery("Salah injury FPL")).toBe("Salah injury FPL");
  });

  it("appends Fantasy Premier League when context is missing", () => {
    expect(enrichFplSearchQuery("Haaland")).toBe(
      "Haaland Fantasy Premier League",
    );
  });
});

describe("buildMoonshotWebSearchFiberBody", () => {
  it("matches the Formula fiber contract", () => {
    expect(buildMoonshotWebSearchFiberBody("Salah injury FPL")).toEqual({
      name: "web_search",
      arguments: JSON.stringify({ query: "Salah injury FPL" }),
    });
  });
});

describe("extractMoonshotFiberContent", () => {
  it("prefers encrypted_output when present", () => {
    expect(
      extractMoonshotFiberContent({
        status: "succeeded",
        context: {
          encrypted_output: "----MOONSHOT ENCRYPTED BEGIN----abc----END----",
          output: "ignored",
        },
      }),
    ).toBe("----MOONSHOT ENCRYPTED BEGIN----abc----END----");
  });

  it("falls back to string output", () => {
    expect(
      extractMoonshotFiberContent({
        status: "succeeded",
        context: { output: "Salah expected to miss GW1" },
      }),
    ).toBe("Salah expected to miss GW1");
  });

  it("stringifies object output", () => {
    expect(
      extractMoonshotFiberContent({
        status: "succeeded",
        context: { output: { results: [{ title: "News" }] } },
      }),
    ).toBe(JSON.stringify({ results: [{ title: "News" }] }));
  });

  it("throws on failed fiber status", () => {
    expect(() =>
      extractMoonshotFiberContent({
        status: "failed",
        error: "quota",
      }),
    ).toThrow(/fiber status: failed/);
  });
});
