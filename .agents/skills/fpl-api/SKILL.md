---
name: fpl-api
description: Fantasy Premier League public API endpoints and how this app maps them to tools. Use when working on FPL data fetching, src/lib/fpl/*, chat tools, manager/player/fixture/league queries, or when the user asks about FPL API paths.
---

# FPL API Skill

Base URL: `https://fantasy.premierleague.com/api`

No authentication. Prefer the typed client in `src/lib/fpl/client.ts` and the chat tools in `src/lib/fpl/tools.ts` over ad-hoc fetches.

## When to use

- Implementing or debugging FPL data access
- Adding/changing chat tools that call the FPL API
- Answering questions about which endpoint provides players, teams, managers, fixtures, live GW stats, or leagues

## Endpoints used by this app

| Endpoint | Client helper | Chat tool | Purpose |
|----------|---------------|-----------|---------|
| `GET /bootstrap-static/` | `getBootstrapStatic` | `get_general_information` | Teams, players, positions, gameweeks |
| `GET /fixtures/` | `getFixtures()` | `get_fixtures` | Full season fixtures + FDR |
| `GET /fixtures/?event={gw}` | `getFixtures(gw)` | `get_fixtures` | Fixtures for one gameweek |
| `GET /event/{gw}/live/` | `getEventLive` | `get_gameweek_live` | Live player points for a GW |
| `GET /entry/{id}/` | `getManagerEntry` | `get_manager_basic_info` | Manager profile + leagues |
| `GET /entry/{id}/history/` | `getManagerHistory` | `get_manager_history` | GW history, chips, past seasons |
| `GET /entry/{id}/event/{gw}/picks/` | `getManagerPicks` | `get_manager_squad`, `get_suggestions` | Squad picks for a GW |
| `GET /leagues-classic/{id}/standings/?page_standings={p}` | `getClassicLeagueStandings` | `get_classic_league_standings` | Classic league table |
| `GET /element-summary/{id}/` | `getElementSummary` | `get_player_detailed_data` | Player history + upcoming fixtures |

Read `references/endpoints.md` for field notes, IDs, and caveats.

## Rules

1. Never invent player IDs, manager IDs, ranks, or fixtures — call the API/tools.
2. Resolve player names via bootstrap `elements[]` (`web_name`, `first_name`, `second_name`) before calling `/element-summary/{id}/`.
3. Prices are in 0.1m units (`130` → £13.0m).
4. Positions: `1=GKP`, `2=DEF`, `3=MID`, `4=FWD`.
5. Status: `a` available, `d` doubtful, `i` injured, `s` suspended, `u` unavailable.
6. FDR is 1 (easy) to 5 (hard).
7. Preseason / missing picks often return 404 — surface that clearly.
8. Space `/element-summary/` calls; do not batch-fetch all players unless explicitly required.
9. For injury/press/news beyond API `news` fields, use the `web_search` tool / `fpl-web-search` skill.

## Quick curl checks

```bash
curl -sS -A 'fpl-assistant/1.0' -H 'Accept: application/json' \
  'https://fantasy.premierleague.com/api/bootstrap-static/' | head -c 200

curl -sS -A 'fpl-assistant/1.0' -H 'Accept: application/json' \
  'https://fantasy.premierleague.com/api/entry/1/'
```
