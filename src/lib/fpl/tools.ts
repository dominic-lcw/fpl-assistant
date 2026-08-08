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
  clearUserPlayerBelief,
  computeBeliefExpectation,
  DEFAULT_HORIZON_GW,
  getBeliefForThesis,
  listBeliefsForThesis,
  MAX_ABS_FORM_BELIEF,
  serializeBelief,
  upsertUserPlayerBelief,
} from "./beliefs";
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
import { runFplAnalysis } from "./duckdb-analysis";
import {
  archiveFormThesis,
  createFormThesis,
  getActiveBeliefMap,
  getActiveThesis,
  getThesisWithBeliefs,
  getUserThesis,
  listUserTheses,
  markThesisApplied,
  serializeThesis,
  synthesizeFormThesis,
} from "./theses";
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
  beliefDelta?: number;
  formBelief?: number;
  minutesRisk?: number;
  beliefConfidence?: number;
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
    beliefDelta: p.beliefDelta,
    formBelief: p.formBelief,
    minutesRisk: p.minutesRisk,
    beliefConfidence: p.beliefConfidence,
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

    analyze_fpl_data: tool({
      description:
        "Run arbitrary DuckDB SQL against a fresh in-memory FPL snapshot. Tables: players (player stats and price), teams (team strengths), fixtures (one row per match with home/away FDR), and player_beliefs (only the signed-in user's active beliefs). Use CTEs, joins, window functions, and aggregation to rank or compare. `fixtures` has one row per fixture, so derive a team's schedule with a UNION ALL of home/away rows. FDR is 1 easiest to 5 hardest. The database is discarded after this analysis; no data is persisted.",
      inputSchema: z.object({
        sql: z
          .string()
          .min(1)
          .max(20_000)
          .describe(
            "DuckDB SQL to run. Example: SELECT position, AVG(form) AS average_form FROM players GROUP BY position ORDER BY average_form DESC",
          ),
        rowLimit: z
          .number()
          .int()
          .min(1)
          .max(1_000)
          .optional()
          .describe("Maximum result rows to return (defaults to 200)."),
      }),
      execute: async ({ sql, rowLimit }) =>
        runFplTool(async () => {
          const [bootstrap, fixtures, beliefs] = await Promise.all([
            getBootstrapStatic(),
            getFixtures(),
            userId ? getActiveBeliefMap(userId) : Promise.resolve(undefined),
          ]);
          return runFplAnalysis({
            bootstrap,
            fixtures,
            beliefs,
            sql,
            rowLimit,
          });
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
          const beliefs = userId ? await getActiveBeliefMap(userId) : undefined;
          const squad = buildSquadSummaries(
            picks,
            bootstrap,
            fixtures,
            gw,
            beliefs,
          );
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
          const activeThesis = userId ? await getActiveThesis(userId) : null;
          const belief =
            userId && activeThesis
              ? await getBeliefForThesis(userId, activeThesis.id, playerId)
              : null;
          const summary = buildPlayerFormSummary(
            element,
            bootstrap,
            fixtures,
            gw.id || 1,
            detail,
            belief
              ? {
                  formBelief: Number(belief.formBelief),
                  minutesRisk: Number(belief.minutesRisk),
                  confidence: Number(belief.confidence),
                }
              : null,
          );
          return {
            player: compactPlayer(summary),
            belief: belief ? serializeBelief(belief) : null,
            thesisId: activeThesis?.id ?? null,
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
        "Build deterministic captain, transfer, and watchlist suggestions for a manager based on form, expected stats, upcoming fixture difficulty, and the signed-in user's private player form beliefs. Returns side-by-side comparison rows plus researchTargets that still need $web_search before advising.",
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
          const beliefs = userId ? await getActiveBeliefMap(userId) : undefined;
          const recs = buildRecommendations({
            bootstrap,
            fixtures,
            picks,
            gameweek: { ...relevant, id: gw },
            beliefs,
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
            activeBeliefCount: beliefs?.size ?? 0,
            disclaimer:
              "Scores are heuristic (form, xGI, EP, fixture difficulty, availability, plus your private form beliefs). Always cross-check news with $web_search and treat as advice, not certainty.",
          };
        }),
    }),

    compare_players: tool({
      description:
        "Side-by-side comparison of 2–4 FPL players using form, xGI, ownership, availability, upcoming fixtures, and the signed-in user's private form beliefs. Resolve names via bootstrap when IDs are unknown.",
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

          const beliefs = userId ? await getActiveBeliefMap(userId) : undefined;
          const details = await Promise.all(
            playerIds.map(async (id) => {
              const element = byId.get(id)!;
              const belief = beliefs?.get(id);
              try {
                const detail = await getElementSummary(id);
                return buildPlayerFormSummary(
                  element,
                  bootstrap,
                  fixtures,
                  fromEvent,
                  detail,
                  belief,
                );
              } catch {
                return buildPlayerFormSummary(
                  element,
                  bootstrap,
                  fixtures,
                  fromEvent,
                  undefined,
                  belief,
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
            activeBeliefCount: beliefs?.size ?? 0,
            disclaimer:
              "Comparison uses FPL API form/xGI/fixtures plus your private form beliefs. Use $web_search when researchTargets is non-empty.",
          };
        }),
    }),

    suggest_squad: tool({
      description:
        "Build a legal 15-player FPL squad (2 GKP, 5 DEF, 5 MID, 3 FWD, max 3 per club) using form, xGI, fixture difficulty, and beliefs from the signed-in user's active form thesis. Prefer synthesize_form_thesis first. Modes: draft_100 (£100.0m blank slate) or wildcard (manager team value + bank). Optionally persist the draft.",
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
        force: z
          .boolean()
          .optional()
          .describe(
            "If true, build even when the active thesis is still collecting (skips synthesis gate).",
          ),
      }),
      execute: async ({ mode, managerId, gameweek, save, title, force }) =>
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

          const beliefs = userId ? await getActiveBeliefMap(userId) : undefined;
          const activeThesis = userId ? await getActiveThesis(userId) : null;
          if (
            activeThesis &&
            activeThesis.status === "collecting" &&
            !force
          ) {
            const packed = await getThesisWithBeliefs(
              userId!,
              activeThesis.id,
            );
            return {
              error:
                "Active form thesis is still collecting beliefs. Call synthesize_form_thesis with a summary first, then suggest_squad. Pass force=true only if the user insists on building before synthesis.",
              thesis: packed?.thesis ?? serializeThesis(activeThesis),
              nextSteps: [
                "Review beliefs with list_player_beliefs / get_form_thesis",
                "Call synthesize_form_thesis with a clear summary of the thesis",
                "Then call suggest_squad again",
              ],
            };
          }

          const built = buildLegalSquad({
            bootstrap,
            fixtures,
            gameweek: { ...relevant, id: gw },
            mode: mode as SquadBuildMode,
            budgetTenths,
            beliefs,
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
            const savedResult = await saveBuiltSquadDraft({
              userId,
              title:
                title ??
                (mode === "draft_100"
                  ? `£100m draft GW${gw}`
                  : `Wildcard draft GW${gw}`),
              built,
              managerId: resolvedManagerId ?? null,
            });
            if (!savedResult.row) {
              return {
                error: savedResult.error ?? "Unable to save invalid squad draft.",
                issues: savedResult.issues,
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
            saved = serializeDraft(savedResult.row);
            if (activeThesis) {
              await markThesisApplied({
                userId,
                thesisId: activeThesis.id,
                linkedDraftId: savedResult.row.id,
              });
            }
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
            activeBeliefCount: beliefs?.size ?? 0,
            thesisId: activeThesis?.id ?? null,
            thesisStatus: activeThesis?.status ?? null,
            picks: built.picks.map(compactDraftPick),
            saved,
            rules: {
              squad: "2 GKP, 5 DEF, 5 MID, 3 FWD",
              maxPerClub: 3,
              formationHint: "XI suggested as 4-4-2; positions 12–15 are bench",
            },
            disclaimer:
              "Heuristic squad from form, xGI, availability, fixture difficulty, and the active form thesis beliefs. Validate before locking in FPL.",
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

    compute_player_expectation: tool({
      description:
        "Calculate quantified expected points for a player from FPL baseline (ep_next/form/ppg) plus belief priors (formBelief, minutesRisk, confidence, horizon). Use before or instead of inventing numbers; pass the same priors into upsert_player_belief to store the result.",
      inputSchema: z.object({
        playerId: playerIdSchema,
        formBelief: z
          .number()
          .min(-MAX_ABS_FORM_BELIEF)
          .max(MAX_ABS_FORM_BELIEF)
          .describe(
            `Delta vs official FPL form (−${MAX_ABS_FORM_BELIEF}…+${MAX_ABS_FORM_BELIEF}).`,
          ),
        minutesRisk: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("0–1 chance of reduced minutes / rotation risk."),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("0–1 how strongly to trust this prior."),
        horizonGw: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Gameweeks to accumulate expected points over."),
      }),
      execute: async ({
        playerId,
        formBelief,
        minutesRisk = 0,
        confidence = 0.5,
        horizonGw = DEFAULT_HORIZON_GW,
      }) =>
        runFplTool(async () => {
          const bootstrap = await getBootstrapStatic();
          const element = bootstrap.elements.find((e) => e.id === playerId);
          if (!element) {
            return { error: `Player ${playerId} was not found.` };
          }
          const expectation = computeBeliefExpectation(
            {
              epNext: Number(element.ep_next ?? 0),
              form: Number(element.form),
              pointsPerGame: Number(element.points_per_game),
            },
            { formBelief, minutesRisk, confidence, horizonGw },
          );
          return {
            player: {
              id: element.id,
              name: element.web_name,
              team: bootstrap.teams.find((t) => t.id === element.team)
                ?.short_name,
              position: bootstrap.element_types.find(
                (t) => t.id === element.element_type,
              )?.singular_name_short,
              form: Number(element.form),
              pointsPerGame: Number(element.points_per_game),
              epNext: Number(element.ep_next ?? 0),
              status: element.status,
            },
            expectation,
            note: "Use expectation.expectedPoints / suggestedCeiling / suggestedFloor when calling upsert_player_belief (or omit them and upsert will compute the same values).",
          };
        }),
    }),

    upsert_player_belief: tool({
      description:
        "Add or update one player belief inside a form thesis (defaults to the active thesis). Automatically quantifies expectedPoints from FPL baseline + priors (and fills ceiling/floor bands when omitted). Never invent beliefs without API or web evidence.",
      inputSchema: z.object({
        playerId: playerIdSchema,
        thesisId: z
          .string()
          .min(1)
          .optional()
          .describe("Defaults to the active working thesis."),
        formBelief: z
          .number()
          .min(-MAX_ABS_FORM_BELIEF)
          .max(MAX_ABS_FORM_BELIEF)
          .describe(
            `Delta vs official FPL form (−${MAX_ABS_FORM_BELIEF}…+${MAX_ABS_FORM_BELIEF}). Positive = expect better form than the API.`,
          ),
        minutesRisk: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("0–1 chance of reduced minutes / rotation risk."),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("0–1 how strongly scoring should trust this prior."),
        expectedPoints: z
          .number()
          .min(0)
          .max(200)
          .optional()
          .describe(
            "Override quantified expected points over horizon. Prefer compute_player_expectation or omit to auto-calculate.",
          ),
        ceiling: z
          .number()
          .optional()
          .describe(
            "Optional upside points band. Omit to use the calculated suggestedCeiling.",
          ),
        floor: z
          .number()
          .optional()
          .describe(
            "Optional downside points band. Omit to use the calculated suggestedFloor.",
          ),
        horizonGw: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("How many gameweeks this prior covers (also sets soft expiry)."),
        rationale: z
          .string()
          .min(8)
          .max(600)
          .describe("Short evidence grounded in API stats and/or web search."),
        sources: z
          .array(z.string().min(1).max(200))
          .max(8)
          .optional()
          .describe("URLs, tool names, or short source labels."),
      }),
      execute: async ({
        playerId,
        thesisId,
        formBelief,
        minutesRisk,
        confidence,
        expectedPoints,
        ceiling,
        floor,
        horizonGw,
        rationale,
        sources,
      }) =>
        runFplTool(async () => {
          if (!userId) {
            return {
              error: "No signed-in user available for private belief storage.",
            };
          }
          const thesis = thesisId
            ? await getUserThesis(userId, thesisId)
            : await getActiveThesis(userId);
          if (!thesis) {
            return {
              error:
                "No active form thesis. Call create_form_thesis first, then upsert beliefs into it.",
            };
          }
          if (thesis.status === "archived") {
            return { error: "Cannot add beliefs to an archived thesis." };
          }
          const bootstrap = await getBootstrapStatic();
          const element = bootstrap.elements.find((e) => e.id === playerId);
          if (!element) {
            return { error: `Player ${playerId} was not found.` };
          }
          const resolvedHorizon =
            horizonGw ?? thesis.horizonGw ?? DEFAULT_HORIZON_GW;
          const expectation = computeBeliefExpectation(
            {
              epNext: Number(element.ep_next ?? 0),
              form: Number(element.form),
              pointsPerGame: Number(element.points_per_game),
            },
            {
              formBelief,
              minutesRisk: minutesRisk ?? 0,
              confidence: confidence ?? 0.5,
              horizonGw: resolvedHorizon,
            },
          );
          const row = await upsertUserPlayerBelief({
            userId,
            thesisId: thesis.id,
            elementId: playerId,
            formBelief,
            minutesRisk,
            confidence,
            expectedPoints: expectedPoints ?? expectation.expectedPoints,
            ceiling: ceiling ?? expectation.suggestedCeiling,
            floor: floor ?? expectation.suggestedFloor,
            horizonGw: resolvedHorizon,
            rationale,
            sources,
          });
          const belief = {
            ...serializeBelief(row),
            name: element.web_name,
            team: bootstrap.teams.find((t) => t.id === element.team)?.short_name,
            position: bootstrap.element_types.find(
              (t) => t.id === element.element_type,
            )?.singular_name_short,
          };
          return {
            thesis: serializeThesis(thesis, { beliefCount: undefined }),
            player: {
              id: element.id,
              name: element.web_name,
              team: belief.team,
              status: element.status,
              form: Number(element.form),
              epNext: Number(element.ep_next ?? 0),
            },
            belief,
            expectation,
            note: "Belief stored with quantified expectedPoints. Thesis status returns to collecting until synthesize_form_thesis.",
          };
        }),
    }),

    list_player_beliefs: tool({
      description:
        "List player beliefs for a form thesis (defaults to the active thesis). Each belief is shown as a structured card in the UI.",
      inputSchema: z.object({
        thesisId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ thesisId, limit = 30 }) =>
        runFplTool(async () => {
          if (!userId) {
            return {
              error: "No signed-in user available for private belief storage.",
            };
          }
          const thesis = thesisId
            ? await getUserThesis(userId, thesisId)
            : await getActiveThesis(userId);
          if (!thesis) {
            return {
              error: "No active form thesis. Call create_form_thesis first.",
              beliefs: [],
            };
          }
          const [rows, bootstrap] = await Promise.all([
            listBeliefsForThesis(userId, thesis.id, limit),
            getBootstrapStatic(),
          ]);
          const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
          const beliefs = rows.map((row) => {
            const belief = serializeBelief(row);
            const element = byId.get(row.elementId);
            return {
              ...belief,
              name: element?.web_name ?? String(row.elementId),
              team: element
                ? bootstrap.teams.find((t) => t.id === element.team)?.short_name
                : undefined,
              position: element
                ? bootstrap.element_types.find(
                    (t) => t.id === element.element_type,
                  )?.singular_name_short
                : undefined,
            };
          });
          return {
            thesis: serializeThesis(thesis, { beliefCount: beliefs.length }),
            beliefs,
          };
        }),
    }),

    get_player_belief: tool({
      description:
        "Fetch one player belief from a form thesis (defaults to active), including the score delta applied in construction.",
      inputSchema: z.object({
        playerId: playerIdSchema,
        thesisId: z.string().min(1).optional(),
      }),
      execute: async ({ playerId, thesisId }) =>
        runFplTool(async () => {
          if (!userId) {
            return {
              error: "No signed-in user available for private belief storage.",
            };
          }
          const thesis = thesisId
            ? await getUserThesis(userId, thesisId)
            : await getActiveThesis(userId);
          if (!thesis) {
            return {
              playerId,
              belief: null,
              note: "No active form thesis.",
            };
          }
          const row = await getBeliefForThesis(userId, thesis.id, playerId);
          if (!row) {
            return {
              thesisId: thesis.id,
              playerId,
              belief: null,
              note: "No belief for this player on the thesis.",
            };
          }
          const bootstrap = await getBootstrapStatic();
          const element = bootstrap.elements.find((e) => e.id === playerId);
          const belief = {
            ...serializeBelief(row),
            name: element?.web_name,
            team: element
              ? bootstrap.teams.find((t) => t.id === element.team)?.short_name
              : undefined,
            position: element
              ? bootstrap.element_types.find(
                  (t) => t.id === element.element_type,
                )?.singular_name_short
              : undefined,
          };
          return {
            thesis: serializeThesis(thesis),
            player: element
              ? {
                  id: element.id,
                  name: element.web_name,
                  team: belief.team,
                  form: Number(element.form),
                  status: element.status,
                }
              : { id: playerId },
            belief,
          };
        }),
    }),

    clear_player_belief: tool({
      description:
        "Delete one player belief from a form thesis (defaults to the active thesis).",
      inputSchema: z.object({
        playerId: playerIdSchema,
        thesisId: z.string().min(1).optional(),
      }),
      execute: async ({ playerId, thesisId }) =>
        runFplTool(async () => {
          if (!userId) {
            return {
              error: "No signed-in user available for private belief storage.",
            };
          }
          const thesis = thesisId
            ? await getUserThesis(userId, thesisId)
            : await getActiveThesis(userId);
          if (!thesis) {
            return { error: "No active form thesis." };
          }
          const deleted = await clearUserPlayerBelief(
            userId,
            thesis.id,
            playerId,
          );
          if (!deleted) {
            return { error: `No belief found for player ${playerId}.` };
          }
          return { deleted: deleted.elementId, thesisId: thesis.id };
        }),
    }),

    create_form_thesis: tool({
      description:
        "Create a named form thesis for the signed-in user. A thesis collects player beliefs; after synthesize_form_thesis, call suggest_squad to build the team. Archives other collecting/synthesized theses by default.",
      inputSchema: z.object({
        title: z.string().min(3).max(120),
        gameweek: gameweekIdSchema.optional(),
        horizonGw: z.number().int().min(1).max(10).optional(),
        archiveOthers: z.boolean().optional(),
      }),
      execute: async ({ title, gameweek, horizonGw, archiveOthers }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for thesis storage." };
          }
          const row = await createFormThesis({
            userId,
            title,
            gameweek,
            horizonGw,
            archiveOthers,
          });
          return {
            thesis: serializeThesis(row, { beliefCount: 0, beliefs: [] }),
            nextSteps: [
              "Quantify with compute_player_expectation (FPL baseline + priors)",
              "Upsert player beliefs with evidence (upsert_player_belief)",
              "Optionally ask_user_choices for risk / differential preference",
              "Call synthesize_form_thesis, then suggest_squad",
            ],
          };
        }),
    }),

    list_form_theses: tool({
      description: "List the signed-in user's form theses (most recent first).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit = 10 }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for thesis storage." };
          }
          const rows = await listUserTheses(userId, limit);
          return {
            theses: rows.map((row) => serializeThesis(row)),
          };
        }),
    }),

    get_form_thesis: tool({
      description:
        "Load one form thesis with all of its player beliefs for display and synthesis.",
      inputSchema: z.object({
        thesisId: z
          .string()
          .min(1)
          .optional()
          .describe("Defaults to the active working thesis."),
      }),
      execute: async ({ thesisId }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for thesis storage." };
          }
          const id = thesisId ?? (await getActiveThesis(userId))?.id;
          if (!id) {
            return { error: "No active form thesis.", thesis: null };
          }
          const packed = await getThesisWithBeliefs(userId, id);
          if (!packed) {
            return { error: `Thesis ${id} was not found.` };
          }
          const bootstrap = await getBootstrapStatic();
          const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
          const beliefs = (packed.thesis.beliefs ?? []).map((belief) => {
            const element = byId.get(belief.elementId);
            return {
              ...belief,
              name: element?.web_name ?? String(belief.elementId),
              team: element
                ? bootstrap.teams.find((t) => t.id === element.team)?.short_name
                : undefined,
              position: element
                ? bootstrap.element_types.find(
                    (t) => t.id === element.element_type,
                  )?.singular_name_short
                : undefined,
            };
          });
          return {
            thesis: { ...packed.thesis, beliefs, beliefCount: beliefs.length },
          };
        }),
    }),

    synthesize_form_thesis: tool({
      description:
        "Write the synthesis for a form thesis (summary of beliefs + strategy) and mark it synthesized so suggest_squad can build the final team.",
      inputSchema: z.object({
        thesisId: z.string().min(1).optional(),
        summary: z
          .string()
          .min(40)
          .max(2000)
          .describe(
            "Synthesis paragraph: key beliefs, risks, and how the squad should be built.",
          ),
        risk: z.enum(["safe", "balanced", "differential"]).optional(),
        budgetFlex: z.string().max(200).optional(),
        notes: z.string().max(400).optional(),
      }),
      execute: async ({ thesisId, summary, risk, budgetFlex, notes }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for thesis storage." };
          }
          const thesis = thesisId
            ? await getUserThesis(userId, thesisId)
            : await getActiveThesis(userId);
          if (!thesis) {
            return { error: "No active form thesis to synthesize." };
          }
          const beliefRows = await listBeliefsForThesis(userId, thesis.id);
          if (beliefRows.length === 0) {
            return {
              error:
                "Thesis has no beliefs yet. Upsert at least one player belief before synthesizing.",
            };
          }
          const result = await synthesizeFormThesis({
            userId,
            thesisId: thesis.id,
            summary,
            preferences: {
              risk,
              budgetFlex,
              notes,
            },
          });
          if (result.error || !result.row) {
            return { error: result.error ?? "Synthesis failed." };
          }
          const packed = await getThesisWithBeliefs(userId, thesis.id);
          return {
            thesis: packed?.thesis ?? serializeThesis(result.row),
            nextSteps: [
              "Call suggest_squad (optionally save=true) to build the final team from this synthesis",
            ],
          };
        }),
    }),

    archive_form_thesis: tool({
      description: "Archive a form thesis owned by the signed-in user.",
      inputSchema: z.object({
        thesisId: z.string().min(1),
      }),
      execute: async ({ thesisId }) =>
        runFplTool(async () => {
          if (!userId) {
            return { error: "No signed-in user available for thesis storage." };
          }
          const row = await archiveFormThesis(userId, thesisId);
          if (!row) {
            return { error: `Thesis ${thesisId} was not found.` };
          }
          return { thesis: serializeThesis(row) };
        }),
    }),
  };
}
