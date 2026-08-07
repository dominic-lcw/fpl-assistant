---
name: fpl-web-search
description: Search the web for Fantasy Premier League topics — player news, injuries, team press, manager lineups, price-change chatter, and tactical context — via Kimi built-in $web_search. Use when FPL API stats are not enough or the user asks about recent news on players, teams, or managers.
---

# FPL Web Search Skill

Use web search for **time-sensitive or off-API** FPL context. Keep official FPL numbers (points, prices, ownership, fixtures, ranks) on the FPL API tools / `fpl-api` skill.

## When to search

- Injuries, suspensions, returns, international breaks
- Press conferences / expected lineups / rotation risk
- Transfer rumors that affect minutes
- Manager comments (club manager or FPL content creators) about selection
- Deadline-day or price-change discussion not present in bootstrap `news`

## When not to search

- Live points, FDR, ownership, prices, manager ranks, squad picks — use FPL API tools
- Pure rule questions already covered by known FPL scoring

## In this repo

The chat assistant exposes Kimi's built-in `$web_search`:

1. Declared as `type: "builtin_function"` / `function.name: "$web_search"` (see `src/lib/kimi/builtin-web-search.ts`).
2. `createKimiProvider()` rewrites AI SDK function tools into that builtin form before each Moonshot request.
3. Tool `execute` **echoes the model arguments as-is** — Kimi itself runs the search.
4. After news findings, re-check API availability fields (`status`, `chance_of_playing_*`, `news`) before advising.

Do **not** call Moonshot Formula `moonshot/web-search:latest` for this app — use the model builtin.

## Coding agents

```bash
pnpm test
```
