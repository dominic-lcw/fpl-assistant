import { tool } from "ai";
import { z } from "zod";

import {
  buildPlayerFormSummary,
  buildRecommendations,
  buildSquadSummaries,
  getRelevantGameweek,
  summarizeManagerSnapshot,
} from "./analysis";
import {
  FplApiError,
  getBootstrapStatic,
  getClassicLeagueStandings,
  getElementSummary,
  getEventLive,
  getFixtures,
  getManagerEntry,
  getManagerHistory,
  getManagerPicks,
} from "./client";
import {
  deleteUserDraft,
  getUserDraft,
  listUserDrafts,
  saveBuiltSquadDraft,
  serializeDraft,
} from "./drafts";
import {
  DRAFT_BUDGET_TENTHS,
  buildLegalSquad,
  type SquadBuildMode,
} from "./squad";
import {
  buildComparisonRows,
  researchTargetsFromSuggestions,
  toCompactSuggestionPlayer,
} from "./suggestion-evidence";
import {
  gameweekIdSchema,
  leagueIdSchema,
  managerIdSchema,
  playerIdSchema,
} from "./validation";

function fplToolError(error: unknown): { error: string } {
  if (error instanceof FplApiError) {
    if (error.status === 404) {
      return {
        error: `FPL data not found (${error.path}). This is common in preseason before gameweek picks are published.`,
      };
    }
    return { error: error.message };
  }
  return {
    error:
      error instanceof Error ? error.message : "Unexpected FPL tool failure.",
  };
}

async function runFplTool<T>(
  fn: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (error) {
    return fplToolError(error);
  }
}

function compactPlayer(p: {
  id: number;
  webName: string;
  teamShort: string;
  position: string;
  cost: number;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  fixtureRunScore: number;
  recommendationScore: number;
  nextFixtures: Array<{
    event: number | null;
    opponent: string;
    isHome: boolean;
    difficulty: number;
  }>;
  status: string;
  news: string;
}) {
  return {
    id: p.id,
    name: p.webName,
    team: p.teamShort,
    position: p.position,
    cost: p.cost,
    form: p.form,
    ppg: p.pointsPerGame,
    totalPoints: p.totalPoints,
    fixtureRunScore: p.fixtureRunScore,
    score: p.recommendationScore,
    nextFixtures: p.nextFixtures.slice(0, 3),
    status: p.status,
    news: p.news || undefined,
  };
}

function compactDraftPick(p: {
  elementId: number;
  webName: string;
  teamShort: string;
  position: string;
  cost: number;
  pickPosition: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  fixtureRunScore: number;
  recommendationScore: number;
  status: string;
}) {
  return {
    id: p.elementId,
    name: p.webName,
    team: p.teamShort,
    position: p.position,
    cost: p.cost,
    pickPosition: p.pickPosition,
    isCaptain: p.isCaptain,
    isViceCaptain: p.isViceCaptain,
    isBench: p.pickPosition > 11,
    form: p.form,
    ppg: p.pointsPerGame,
    totalPoints: p.totalPoints,
    fixtureRunScore: p.fixtureRunScore,
    score: p.recommendationScore,
    status: p.status,
  };
}

export function createFplTools(options?: {
  managerId?: number;
  userId?: string;
}) {
  const defaultManagerId = options?.managerId;
  const userId = options?.userId;

  return {
    get_general_information: tool({
      description:
        "Fetch Fantasy Premier League general/bootstrap information: current gameweek, teams, and high-level season context.",
      inputSchema: z.object({}),
      execute: async () =>
        runFplTool(async () => {
          const bootstrap = await getBootstrapStatic();
          const gameweek = getRelevantGameweek(bootstrap);
          return {
            totalPlayers: bootstrap.total_players,
            gameweek,
            teams: bootstrap.teams.map((t) => ({
              id: t.id,
              name: t.name,
              shortName: t.short_name,
              strength: t.strength,
            })),
            positions: bootstrap.element_types.map((t) => ({
              id: t.id,
              short: t.singular_name_short,
              name: t.singular_name,
            })),
            playerCount: bootstrap.elements.length,
          };
        }),
    }),

    get_fixtures: tool({
      description:
        "Fetch season fixtures, optionally filtered to a specific gameweek. Includes fixture difficulty ratings.",
      inputSchema: z.object({
        gameweek: gameweekIdSchema.optional().describe("Optional gameweek ID"),
      }),
      execute: async ({ gameweek }) =>
        runFplTool(async () => {
          const [fixtures, bootstrap] = await Promise.all([
            getFixtures(gameweek),
            getBootstrapStatic(),
          ]);
          const teamName = (id: number) =>
            bootstrap.teams.find((t) => t.id === id)?.short_name ?? String(id);

          return fixtures.slice(0, gameweek ? 20 : 40).map((f) => ({
            id: f.id,
            event: f.event,
            home: teamName(f.team_h),
            away: teamName(f.team_a),
            homeDifficulty: f.team_h_difficulty,
            awayDifficulty: f.team_a_difficulty,
            kickoff: f.kickoff_time,
            finished: f.finished,
            score:
              f.team_h_score != null && f.team_a_score != null
                ? `${f.team_h_score}-${f.team_a_score}`
                : null,
          }));
        }),
    }),

    get_gameweek_live: tool({
      description:
        "Fetch live player stats for a gameweek. Defaults to the current/relevant gameweek.",
      inputSchema: z.object({
        gameweek: gameweekIdSchema.optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ gameweek, limit = 25 }) =>
        runFplTool(async () => {
          const bootstrap = await getBootstrapStatic();
          const gw = gameweek ?? getRelevantGameweek(bootstrap).id;
          if (!gw) {
            return { error: "No relevant gameweek is available yet." };
          }
          const live = await getEventLive(gw);
          const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
          const ranked = [...live.elements]
            .sort((a, b) => b.stats.total_points - a.stats.total_points)
            .slice(0, limit)
            .map((el) => {
              const meta = byId.get(el.id);
              return {
                id: el.id,
                name: meta?.web_name ?? String(el.id),
                team: meta
                  ? bootstrap.teams.find((t) => t.id === meta.team)?.short_name
                  : undefined,
                points: el.stats.total_points,
                minutes: el.stats.minutes,
                goals: el.stats.goals_scored,
                assists: el.stats.assists,
                bonus: el.stats.bonus,
                xgi: Number(el.stats.expected_goal_involvements),
              };
            });
          return { gameweek: gw, topPerformers: ranked };
        }),
    }),

    get_manager_basic_info: tool({
      description:
        "Fetch a manager's basic profile: name, team name, ranks, favourite team, and classic leagues.",
      inputSchema: z.object({
        managerId: managerIdSchema
          .optional()
          .describe("Manager/entry ID. Defaults to the selected manager."),
      }),
      execute: async ({ managerId }) =>
        runFplTool(async () => {
          const id = managerId ?? defaultManagerId;
          if (!id) {
            return {
              error:
                "No manager ID provided. Ask the user to enter their Manager ID.",
            };
          }
          const [entry, bootstrap] = await Promise.all([
            getManagerEntry(id),
            getBootstrapStatic(),
          ]);
          return summarizeManagerSnapshot(entry, bootstrap);
        }),
    }),

    get_manager_history: tool({
      description:
        "Fetch a manager's gameweek history, past seasons, and chips used this season.",
      inputSchema: z.object({
        managerId: managerIdSchema.optional(),
      }),
      execute: async ({ managerId }) =>
        runFplTool(async () => {
          const id = managerId ?? defaultManagerId;
          if (!id) {
            return {
              error:
                "No manager ID provided. Ask the user to enter their Manager ID.",
            };
          }
          const history = await getManagerHistory(id);
          return {
            recentGameweeks: history.current.slice(-8),
            pastSeasons: history.past.slice(-5),
            chips: history.chips,
          };
        }),
    }),

    get_manager_squad: tool({
      description:
        "Fetch the manager's squad picks for a gameweek, enriched with form and upcoming fixtures.",
      inputSchema: z.object({
        managerId: managerIdSchema.optional(),
        gameweek: gameweekIdSchema.optional(),
      }),
      execute: async ({ managerId, gameweek }) =>
        runFplTool(async () => {
          const id = managerId ?? defaultManagerId;
          if (!id) {
            return {
              error:
                "No manager ID provided. Ask the user to enter their Manager ID.",
            };
          }
          const [bootstrap, fixtures, entry] = await Promise.all([
            getBootstrapStatic(),
            getFixtures(),
            getManagerEntry(id),
          ]);
          const gw =
            gameweek ??
            entry.current_event ??
            getRelevantGameweek(bootstrap).id;
          if (!gw) {
            return { error: "No gameweek available for squad picks." };
          }
          const picks = await getManagerPicks(id, gw);
          const squad = buildSquadSummaries(picks, bootstrap, fixtures, gw);
          return {
            gameweek: gw,
            bank: picks.entry_history.bank / 10,
            teamValue: picks.entry_history.value / 10,
            activeChip: picks.active_chip,
            squad: squad.map((p) => ({
              ...compactPlayer(p),
              pickPosition: p.pickPosition,
              isCaptain: p.isCaptain,
              isViceCaptain: p.isViceCaptain,
              isBench: p.isBench,
            })),
          };
        }),
    }),

    get_classic_league_standings: tool({
      description: "Fetch classic league standings for a league ID.",
      inputSchema: z.object({
        leagueId: leagueIdSchema,
        page: z.number().int().positive().optional(),
      }),
      execute: async ({ leagueId, page = 1 }) =>
        runFplTool(async () => {
          const data = await getClassicLeagueStandings(leagueId, page);
          return {
            league: data.league,
            page: data.standings.page,
            hasNext: data.standings.has_next,
            standings: data.standings.results.slice(0, 25).map((r) => ({
              rank: r.rank,
              lastRank: r.last_rank,
              entry: r.entry,
              entryName: r.entry_name,
              playerName: r.player_name,
              total: r.total,
              eventTotal: r.event_total,
            })),
          };
        }),
    }),

    get_player_detailed_data: tool({
      description:
        "Fetch detailed player data: upcoming fixtures, recent history, and previous seasons. Accepts a player/element ID.",
      inputSchema: z.object({
        playerId: playerIdSchema,
      }),
      execute: async ({ playerId }) =>
        runFplTool(async () => {
          const [bootstrap, fixtures, detail] = await Promise.all([
            getBootstrapStatic(),
            getFixtures(),
            getElementSummary(playerId),
          ]);
          const element = bootstrap.elements.find((e) => e.id === playerId);
          if (!element) {
            return { error: `Player ${playerId} was not found.` };
          }
          const gw = getRelevantGameweek(bootstrap);
          const summary = buildPlayerFormSummary(
            element,
            bootstrap,
            fixtures,
            gw.id || 1,
            detail,
          );
          return {
            player: compactPlayer(summary),
            recentHistory: detail.history.slice(-6).map((h) => ({
              round: h.round,
              opponent: bootstrap.teams.find((t) => t.id === h.opponent_team)
                ?.short_name,
              wasHome: h.was_home,
              points: h.total_points,
              minutes: h.minutes,
              goals: h.goals_scored,
              assists: h.assists,
              xgi: Number(h.expected_goal_involvements),
            })),
            upcomingFixtures: detail.fixtures.slice(0, 5).map((f) => ({
              event: f.event,
              difficulty: f.difficulty,
              isHome: f.is_home,
              opponent: bootstrap.teams.find(
                (t) => t.id === (f.is_home ? f.team_a : f.team_h),
              )?.short_name,
              kickoff: f.kickoff_time,
            })),
            pastSeasons: detail.history_past.slice(-3),
          };
        }),
    }),

    get_suggestions: tool({
      description:
        "Build deterministic captain, transfer, and watchlist suggestions for a manager based on form, expected stats, and upcoming fixture difficulty. Returns side-by-side comparison rows plus researchTargets that still need $web_search before advising.",
      inputSchema: z.object({
        managerId: managerIdSchema.optional(),
        gameweek: gameweekIdSchema.optional(),
      }),
      execute: async ({ managerId, gameweek }) =>
        runFplTool(async () => {
          const id = managerId ?? defaultManagerId;
          if (!id) {
            return {
              error:
                "No manager ID provided. Ask the user to enter their Manager ID.",
            };
          }
          const [bootstrap, fixtures, entry] = await Promise.all([
            getBootstrapStatic(),
            getFixtures(),
            getManagerEntry(id),
          ]);
          const relevant = getRelevantGameweek(bootstrap);
          const gw = gameweek ?? entry.current_event ?? relevant.id;
          if (!gw) {
            return {
              error:
                "Suggestions are unavailable because no gameweek data exists yet (preseason).",
            };
          }
          const picks = await getManagerPicks(id, gw);
          const recs = buildRecommendations({
            bootstrap,
            fixtures,
            picks,
            gameweek: { ...relevant, id: gw },
          });
          const captainCandidates = recs.captainCandidates.map(
            toCompactSuggestionPlayer,
          );
          const transferOutCandidates = recs.transferOutCandidates.map(
            toCompactSuggestionPlayer,
          );
          const transferInCandidates = recs.transferInCandidates.map(
            toCompactSuggestionPlayer,
          );
          return {
            gameweek: recs.gameweek,
            bank: picks.entry_history.bank / 10,
            captainCandidates,
            transferOutCandidates,
            transferInCandidates,
            watchlist: recs.watchlist.map(toCompactSuggestionPlayer),
            comparisons: {
              captain: buildComparisonRows(recs.captainCandidates, 3),
              transferIn: buildComparisonRows(recs.transferInCandidates, 3),
              transferOut: buildComparisonRows(recs.transferOutCandidates, 3),
            },
            researchTargets: researchTargetsFromSuggestions({
              captains: captainCandidates,
              transferOut: transferOutCandidates,
              transferIn: transferInCandidates,
            }),
            nextSteps: [
              "If researchTargets is non-empty, call $web_search for those players before locking advice.",
              "Present captain and transfer comparisons with form, xGI, ownership, fixtures, and news risk.",
              "If risk appetite, budget, or differential preference is unknown, call ask_user_choices first.",
            ],
            disclaimer:
              "Scores are heuristic (form, xGI, minutes, fixture difficulty, availability). Always cross-check news with $web_search and treat as advice, not certainty.",
          };
        }),
    }),

    compare_players: tool({
      description:
        "Side-by-side comparison of 2–4 FPL players using form, xGI, ownership, availability, and upcoming fixtures. Resolve names via bootstrap when IDs are unknown.",
      inputSchema: z.object({
        playerIds: z
          .array(playerIdSchema)
          .min(2)
          .max(4)
          .describe("FPL element IDs to compare"),
        gameweek: gameweekIdSchema.optional(),
      }),
      execute: async ({ playerIds, gameweek }) =>
        runFplTool(async () => {
          const [bootstrap, fixtures] = await Promise.all([
            getBootstrapStatic(),
            getFixtures(),
          ]);
          const relevant = getRelevantGameweek(bootstrap);
          const fromEvent = gameweek ?? (relevant.id > 0 ? relevant.id : 1);
          const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
          const missing = playerIds.filter((id) => !byId.has(id));
          if (missing.length > 0) {
            return {
              error: `Unknown player IDs: ${missing.join(", ")}. Resolve names via get_general_information first.`,
            };
          }

          const details = await Promise.all(
            playerIds.map(async (id) => {
              const element = byId.get(id)!;
              try {
                const detail = await getElementSummary(id);
                return buildPlayerFormSummary(
                  element,
                  bootstrap,
                  fixtures,
                  fromEvent,
                  detail,
                );
              } catch {
                return buildPlayerFormSummary(
                  element,
                  bootstrap,
                  fixtures,
                  fromEvent,
                );
              }
            }),
          );

          const ranked = [...details].sort(
            (a, b) => b.recommendationScore - a.recommendationScore,
          );
          return {
            gameweek: relevant,
            players: ranked.map(toCompactSuggestionPlayer),
            comparison: buildComparisonRows(ranked, ranked.length),
            researchTargets: researchTargetsFromSuggestions({
              captains: ranked.map(toCompactSuggestionPlayer),
              transferOut: [],
              transferIn: [],
            }),
            disclaimer:
              "Comparison uses FPL API form/xGI/fixtures. Use $web_search when researchTargets is non-empty.",
          };
        }),
    }),

    suggest_squad: tool({
      description:
        "Build a legal 15-player FPL squad (2 GKP, 5 DEF, 5 MID, 3 FWD, max 3 per club) using form, xGI, and fixture difficulty. Modes: draft_100 (£100.0m blank slate) or wildcard (manager team value + bank). Optionally persist the draft for the signed-in user in Postgres.",
      inputSchema: z.object({
        mode: z
          .enum(["draft_100", "wildcard"])
          .describe(
            "draft_100 = fresh £100.0m squad; wildcard = rebuild using manager value + bank",
          ),
        managerId: managerIdSchema
          .optional()
          .describe("Required for wildcard mode unless a Manager ID is in context."),
        gameweek: gameweekIdSchema.optional(),
        save: z
          .boolean()
          .optional()
          .describe("If true, persist this squad draft for the user in Postgres."),
        title: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .describe("Title when saving the draft."),
      }),
      execute: async ({ mode, managerId, gameweek, save, title }) =>
        runFplTool(async () => {
          const [bootstrap, fixtures] = await Promise.all([
            getBootstrapStatic(),
            getFixtures(),
          ]);
          const relevant = getRelevantGameweek(bootstrap);
          let budgetTenths = DRAFT_BUDGET_TENTHS;
          let resolvedManagerId: number | undefined;
          let gw = gameweek ?? relevant.id;

          if (mode === "wildcard") {
            resolvedManagerId = managerId ?? defaultManagerId;
            if (!resolvedManagerId) {
              return {
                error:
                  "Wildcard mode needs a manager ID. Ask the user to enter their Manager ID.",
              };
            }
            const entry = await getManagerEntry(resolvedManagerId);
            gw = gameweek ?? entry.current_event ?? relevant.id;
            if (!gw) {
              return {
                error:
                  "No gameweek available to resolve manager team value (common in preseason). Use draft_100 instead.",
              };
            }
            const picks = await getManagerPicks(resolvedManagerId, gw);
            budgetTenths =
              picks.entry_history.value + picks.entry_history.bank;
          }

          if (!gw) {
            gw = 1;
          }

          const built = buildLegalSquad({
            bootstrap,
            fixtures,
            gameweek: { ...relevant, id: gw },
            mode: mode as SquadBuildMode,
            budgetTenths,
          });

          let saved: ReturnType<typeof serializeDraft> | null = null;
          if (save) {
            if (!userId) {
              return {
                error: "Cannot save draft: no signed-in user on this request.",
                squad: {
                  mode: built.mode,
                  valid: built.valid,
                  issues: built.issues,
                  gameweek: built.gameweek,
                  budget: built.budgetTenths / 10,
                  cost: built.costTenths / 10,
                  bank: built.bankTenths / 10,
                  averageScore: built.averageScore,
                  picks: built.picks.map(compactDraftPick),
                },
              };
            }
            const row = await saveBuiltSquadDraft({
              userId,
              title:
                title ??
                (mode === "draft_100"
                  ? `£100m draft GW${gw}`
                  : `Wildcard draft GW${gw}`),
              built,
              managerId: resolvedManagerId ?? null,
            });
            saved = serializeDraft(row);
          }

          return {
            mode: built.mode,
            valid: built.valid,
            issues: built.issues,
            gameweek: built.gameweek,
            budget: built.budgetTenths / 10,
            cost: built.costTenths / 10,
            bank: built.bankTenths / 10,
            averageScore: built.averageScore,
            managerId: resolvedManagerId,
            picks: built.picks.map(compactDraftPick),
            saved,
            rules: {
              squad: "2 GKP, 5 DEF, 5 MID, 3 FWD",
              maxPerClub: 3,
              formationHint: "XI suggested as 4-4-2; positions 12–15 are bench",
            },
            disclaimer:
              "Heuristic squad from form, xGI, availability, and fixture difficulty. Validate before locking in FPL.",
          };
        }),
    }),

    list_squad_drafts: tool({
      description:
        "List the signed-in user's persisted FPL squad drafts from Postgres (most recent first).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit = 10 }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for draft storage." };
          }
          const rows = await listUserDrafts(userId, limit);
          return {
            drafts: rows.map((row) => ({
              id: row.id,
              title: row.title,
              mode: row.mode,
              status: row.status,
              budget: row.budgetTenths / 10,
              cost: row.costTenths / 10,
              bank: row.bankTenths / 10,
              gameweek: row.gameweek,
              managerId: row.managerId,
              pickCount: row.picks.length,
              updatedAt: row.updatedAt.toISOString(),
            })),
          };
        }),
    }),

    get_squad_draft: tool({
      description:
        "Load one persisted squad draft (15 picks + budget) for the signed-in user from Postgres.",
      inputSchema: z.object({
        draftId: z.string().min(1).describe("Squad draft UUID"),
      }),
      execute: async ({ draftId }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for draft storage." };
          }
          const row = await getUserDraft(userId, draftId);
          if (!row) {
            return { error: `Draft ${draftId} was not found.` };
          }
          const draft = serializeDraft(row);
          return {
            ...draft,
            picks: draft.picks.map(compactDraftPick),
          };
        }),
    }),

    delete_squad_draft: tool({
      description: "Delete a persisted squad draft owned by the signed-in user.",
      inputSchema: z.object({
        draftId: z.string().min(1),
      }),
      execute: async ({ draftId }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for draft storage." };
          }
          const deleted = await deleteUserDraft(userId, draftId);
          if (!deleted) {
            return { error: `Draft ${draftId} was not found.` };
          }
          return { deleted: deleted.id };
        }),
    }),
  };
}
