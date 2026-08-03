import { describe, expect, it } from "vitest";

import {
  enrichFplSearchQuery,
  parseDuckDuckGoHtml,
} from "./web-search-shared";

describe("enrichFplSearchQuery", () => {
  it("keeps queries that already mention FPL context", () => {
    expect(enrichFplSearchQuery("Salah injury FPL")).toBe("Salah injury FPL");
    expect(enrichFplSearchQuery("Arsenal lineup Premier League")).toBe(
      "Arsenal lineup Premier League",
    );
  });

  it("appends Fantasy Premier League when context is missing", () => {
    expect(enrichFplSearchQuery("Haaland")).toBe(
      "Haaland Fantasy Premier League",
    );
  });
});

describe("parseDuckDuckGoHtml", () => {
  it("extracts titles, urls, and snippets", () => {
    const html = `
      <div class="result__body">
        <h2 class="result__title">
          <a class="result__a" href="https://www.premierleague.com/injuries">Premier League injuries</a>
        </h2>
        <a class="result__snippet">Latest club-by-club injury updates.</a>
      </div>
      <div class="result__body">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/haaland">Haaland latest</a>
        </h2>
        <div class="result__snippet">Minutes risk ahead of the weekend.</div>
      </div>
    `;

    expect(parseDuckDuckGoHtml(html, 5)).toEqual([
      {
        title: "Premier League injuries",
        url: "https://www.premierleague.com/injuries",
        snippet: "Latest club-by-club injury updates.",
      },
      {
        title: "Haaland latest",
        url: "https://example.com/haaland",
        snippet: "Minutes risk ahead of the weekend.",
      },
    ]);
  });

  it("respects the result limit", () => {
    const html = `
      <div class="result__body">
        <a class="result__a" href="https://a.example">A</a>
        <div class="result__snippet">one</div>
      </div>
      <div class="result__body">
        <a class="result__a" href="https://b.example">B</a>
        <div class="result__snippet">two</div>
      </div>
    `;
    expect(parseDuckDuckGoHtml(html, 1)).toHaveLength(1);
  });
});
