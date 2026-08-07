# FPL API endpoint reference

Base: `https://fantasy.premierleague.com/api`

## GET /bootstrap-static/

Core season payload.

Useful arrays:

- `events[]` — gameweeks (`is_current`, `is_next`, `deadline_time`, scores)
- `teams[]` — Premier League clubs (`id`, `name`, `short_name`, strength fields)
- `elements[]` — players (~600). Key fields: `id`, `web_name`, `team`, `element_type`, `now_cost`, `form`, `points_per_game`, `total_points`, `selected_by_percent`, expected stats, `status`, `news`, `chance_of_playing_*`
- `element_types[]` — positions
- `total_players` — overall FPL entrants

App usage: season context, ID lookups, recommendation inputs.

## GET /fixtures/ and /fixtures/?event={gw}

Fixture list with `team_h` / `team_a`, kickoff, scores, and FDR (`team_h_difficulty`, `team_a_difficulty`).

## GET /event/{gw}/live/

Live/finished GW element stats under `elements[].stats` (points, minutes, goals, assists, bonus, expected stats).

## GET /entry/{managerId}/

Manager profile: name, team name, overall points/rank, current event, favourite team, classic/h2h leagues.

## GET /entry/{managerId}/history/

- `current[]` — this season GW scores/ranks/transfers
- `past[]` — previous seasons
- `chips[]` — chips used

## GET /entry/{managerId}/event/{gw}/picks/

Squad for a gameweek: picks (element, position, captain/vice, multiplier), entry history (bank/value), active chip. Often unavailable in preseason.

## GET /leagues-classic/{leagueId}/standings/?page_standings={page}

Classic league metadata + paginated standings (`rank`, `entry`, `entry_name`, `player_name`, `total`, `event_total`).

## GET /element-summary/{playerId}/

- `history[]` — recent GW performances
- `fixtures[]` — upcoming fixtures for that player/team
- `history_past[]` — prior seasons

## ID cheat sheet

| Concept | Source |
|---------|--------|
| Player ID | `bootstrap.elements[].id` |
| Team ID | `bootstrap.teams[].id` |
| Gameweek ID | `bootstrap.events[].id` |
| Manager / entry ID | URL on fantasy.premierleague.com (`/entry/{id}/history`) |
| Classic league ID | Manager entry `leagues.classic[].id` |

## Related app files

- `src/lib/fpl/client.ts` — fetch wrappers + caching/`revalidate`
- `src/lib/fpl/types.ts` — response types
- `src/lib/fpl/tools.ts` — AI tools exposed to the chat agent
- `src/lib/fpl/analysis.ts` — form/fixture scoring and suggestions
- `src/app/api/chat/route.ts` — wires tools + system prompt
