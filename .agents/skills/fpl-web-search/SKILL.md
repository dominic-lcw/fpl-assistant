---
name: fpl-web-search
description: Search the web for Fantasy Premier League topics — player news, injuries, team press, manager lineups, price-change chatter, and tactical context — via Azure Foundry web_search. Use when FPL API stats are not enough or the user asks about recent news on players, teams, or managers.
---

# FPL Web Search Skill

Use web search for **time-sensitive or off-API** FPL context. Keep official FPL numbers (points, prices, ownership, fixtures, ranks) on the FPL API tools / `fpl-api` skill.

## When to search

- Injuries, suspensions, returns, international breaks
- Press conferences / expected lineups / rotation risk
- Transfer rumors that affect minutes
- Manager comments (club manager or FPL content creators) about selection
- Deadline-day or price-change discussion not present in bootstrap `news`
- After `get_suggestions` / `compare_players` returns non-empty `researchTargets`

## Clarifying before advising

Prefer the chat `ask_user_choices` tool when risk appetite, budget flexibility, or template vs differential preference would change the recommendation. Then compare options with API evidence and only then search the web for news risk.

## When not to search

- Live points, FDR, ownership, prices, manager ranks, squad picks — use FPL API tools
- Pure rule questions already covered by known FPL scoring

## In this repo

The chat assistant exposes Azure Foundry's built-in `web_search` (Responses API / Bing grounding):

1. Created via `azure.tools.webSearch()` in `src/lib/llm/web-search.ts`.
2. Attached in `src/app/api/chat/route.ts` alongside FPL and community tools.
3. The model runs search server-side; cite returned URL sources in the reply.
4. After news findings, re-check API availability fields (`status`, `chance_of_playing_*`, `news`) before advising.

Uses the same Azure Foundry credentials as chat (`AZURE_API_KEY` + resource/endpoint). No separate search key.

## Coding agents

```bash
pnpm test
```
