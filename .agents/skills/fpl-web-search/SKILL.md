---
name: fpl-web-search
description: Search the web for Fantasy Premier League topics — player news, injuries, team press, manager lineups, price-change chatter, and tactical context. Use when FPL API stats are not enough or the user asks about recent news on players, teams, or managers.
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

## Query patterns

Prefer focused queries:

- `"{player}" injury OR doubtful OR suspended Premier League`
- `"{player}" expected minutes OR lineup {team}`
- `"{team}" press conference injuries`
- `"FPL" "{player}" price rise OR fall`
- `"{manager name}" FPL OR "fantasy premier league" rank OR team` when looking up a human FPL manager in media (not the `/entry/{id}` API profile)

Add season/gameweek hints when relevant (`GW12`, `2025/26`).

## In this repo

The chat assistant exposes a `web_search` tool (`src/lib/fpl/web-search.ts`, wired in `src/lib/fpl/tools.ts`):

1. Prefer that tool from the FPL Assistant chat agent.
2. Provider order: optional `TAVILY_API_KEY` → DuckDuckGo HTML → Google News RSS → Wikipedia.
3. Cite result titles/URLs and distinguish rumor vs confirmed club/league reporting.
4. After news findings, re-check API availability fields (`status`, `chance_of_playing_*`, `news`) before giving transfer/captain advice.

## Coding agents

When developing or verifying search behavior outside the chat UI, run unit tests in `src/lib/fpl/web-search.test.ts` and exercise:

```bash
pnpm test
```
