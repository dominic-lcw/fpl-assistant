import type {
  BootstrapStatic,
  ElementSummary,
  Fixture,
  FplElement,
  ManagerPicks,
  PlayerFormSummary,
  RecommendationBundle,
  RelevantGameweek,
  SquadPlayerSummary,
} from "./types";

export function getRelevantGameweek(
  bootstrap: BootstrapStatic,
): RelevantGameweek {
  const events = bootstrap.events ?? [];
  const current = events.find((e) => e.is_current);
  if (current) {
    return {
      id: current.id,
      name: current.name,
      kind: "current",
      deadline_time: current.deadline_time,
    };
  }

  const next = events.find((e) => e.is_next);
  if (next) {
    return {
      id: next.id,
      name: next.name,
      kind: "next",
      deadline_time: next.deadline_time,
    };
  }

  const previous = events.find((e) => e.is_previous);
  if (previous) {
    return {
      id: previous.id,
      name: previous.name,
      kind: "previous",
      deadline_time: previous.deadline_time,
    };
  }

  const finished = [...events].reverse().find((e) => e.finished);
  if (finished) {
    return {
      id: finished.id,
      name: finished.name,
      kind: "latest_finished",
      deadline_time: finished.deadline_time,
    };
  }

  return {
    id: 0,
    name: "Unavailable",
    kind: "unavailable",
    deadline_time: null,
  };
}

export function getPositionShort(
  bootstrap: BootstrapStatic,
  elementType: number,
): string {
  return (
    bootstrap.element_types.find((t) => t.id === elementType)
      ?.singular_name_short ?? "UNK"
  );
}

export function getTeamShort(
  bootstrap: BootstrapStatic,
  teamId: number,
): string {
  return bootstrap.teams.find((t) => t.id === teamId)?.short_name ?? "???";
}

function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function summarizeRecentForm(
  history: ElementSummary["history"],
  lastN = 5,
): { recentPoints: number; recentMinutes: number; recentXgi: number } {
  const recent = history.slice(-lastN);
  return {
    recentPoints: recent.reduce((sum, h) => sum + h.total_points, 0),
    recentMinutes: recent.reduce((sum, h) => sum + h.minutes, 0),
    recentXgi: recent.reduce(
      (sum, h) => sum + num(h.expected_goal_involvements),
      0,
    ),
  };
}

export function getUpcomingFixturesForTeam(
  fixtures: Fixture[],
  teamId: number,
  fromEvent: number,
  count = 5,
): Array<{
  event: number | null;
  opponentTeamId: number;
  opponent: string;
  isHome: boolean;
  difficulty: number;
}> {
  return fixtures
    .filter(
      (f) =>
        !f.finished &&
        f.event != null &&
        f.event >= fromEvent &&
        (f.team_h === teamId || f.team_a === teamId),
    )
    .sort((a, b) => (a.event ?? 99) - (b.event ?? 99) || a.id - b.id)
    .slice(0, count)
    .map((f) => {
      const isHome = f.team_h === teamId;
      return {
        event: f.event,
        opponentTeamId: isHome ? f.team_a : f.team_h,
        opponent: "",
        isHome,
        difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
      };
    });
}

/** Lower difficulty is better; score is 0–10. */
export function scoreFixtureRun(
  difficulties: number[],
): number {
  if (difficulties.length === 0) return 0;
  const avg =
    difficulties.reduce((sum, d) => sum + d, 0) / difficulties.length;
  // FDR 1 → 10, FDR 5 → 0
  return Math.max(0, Math.min(10, (5 - avg) * 2.5));
}

export function buildPlayerFormSummary(
  element: FplElement,
  bootstrap: BootstrapStatic,
  fixtures: Fixture[],
  fromEvent: number,
  detail?: ElementSummary,
): PlayerFormSummary {
  const recent = detail
    ? summarizeRecentForm(detail.history)
    : { recentPoints: 0, recentMinutes: 0, recentXgi: 0 };

  const upcomingRaw = getUpcomingFixturesForTeam(
    fixtures,
    element.team,
    fromEvent,
    5,
  );
  const nextFixtures = upcomingRaw.map((f) => ({
    event: f.event,
    opponent: getTeamShort(bootstrap, f.opponentTeamId),
    isHome: f.isHome,
    difficulty: f.difficulty,
  }));

  const fixtureRunScore = scoreFixtureRun(nextFixtures.map((f) => f.difficulty));
  const form = num(element.form);
  const ppg = num(element.points_per_game);
  const xgi = num(element.expected_goal_involvements);
  const availability =
    element.status === "a"
      ? 1
      : element.chance_of_playing_next_round != null
        ? element.chance_of_playing_next_round / 100
        : 0.5;

  const recommendationScore =
    form * 1.4 +
    ppg * 1.1 +
    recent.recentPoints * 0.35 +
    recent.recentXgi * 1.2 +
    xgi * 0.8 +
    fixtureRunScore * 0.9 +
    availability * 2 -
    (element.status !== "a" ? 2 : 0);

  return {
    id: element.id,
    webName: element.web_name,
    teamId: element.team,
    teamShort: getTeamShort(bootstrap, element.team),
    position: getPositionShort(bootstrap, element.element_type),
    cost: element.now_cost / 10,
    form,
    pointsPerGame: ppg,
    totalPoints: element.total_points,
    expectedGoalInvolvements: xgi,
    selectedByPercent: num(element.selected_by_percent),
    status: element.status,
    news: element.news,
    chanceOfPlayingNextRound: element.chance_of_playing_next_round,
    recentPoints: recent.recentPoints,
    recentMinutes: recent.recentMinutes,
    recentXgi: recent.recentXgi,
    fixtureRunScore: Number(fixtureRunScore.toFixed(2)),
    nextFixtures,
    recommendationScore: Number(recommendationScore.toFixed(2)),
  };
}

export function buildSquadSummaries(
  picks: ManagerPicks,
  bootstrap: BootstrapStatic,
  fixtures: Fixture[],
  fromEvent: number,
): SquadPlayerSummary[] {
  const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
  return picks.picks
    .map((pick) => {
      const element = byId.get(pick.element);
      if (!element) return null;
      const summary = buildPlayerFormSummary(
        element,
        bootstrap,
        fixtures,
        fromEvent,
      );
      return {
        ...summary,
        pickPosition: pick.position,
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        isBench: pick.position > 11,
        multiplier: pick.multiplier,
      } satisfies SquadPlayerSummary;
    })
    .filter((p): p is SquadPlayerSummary => p != null)
    .sort((a, b) => a.pickPosition - b.pickPosition);
}

export function buildRecommendations(params: {
  bootstrap: BootstrapStatic;
  fixtures: Fixture[];
  picks: ManagerPicks;
  gameweek?: RelevantGameweek;
}): RecommendationBundle {
  const gameweek = params.gameweek ?? getRelevantGameweek(params.bootstrap);
  const fromEvent = gameweek.id > 0 ? gameweek.id : 1;
  const squad = buildSquadSummaries(
    params.picks,
    params.bootstrap,
    params.fixtures,
    fromEvent,
  );

  const squadIds = new Set(squad.map((p) => p.id));
  const bank = params.picks.entry_history.bank / 10;

  const captainCandidates = [...squad]
    .filter((p) => !p.isBench && p.status === "a")
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 5);

  const transferOutCandidates = [...squad]
    .filter((p) => p.status !== "a" || p.form < 2.5 || p.fixtureRunScore < 3.5)
    .sort((a, b) => a.recommendationScore - b.recommendationScore)
    .slice(0, 5);

  const market = params.bootstrap.elements
    .filter((e) => !squadIds.has(e.id) && e.status === "a" && e.minutes > 0)
    .map((e) =>
      buildPlayerFormSummary(e, params.bootstrap, params.fixtures, fromEvent),
    )
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  const transferInCandidates = market
    .filter((p) => {
      // Prefer players affordable relative to a weak squad member + bank
      const cheapestOut = transferOutCandidates[0]?.cost ?? 4.5;
      return p.cost <= cheapestOut + bank + 0.5;
    })
    .slice(0, 8);

  const watchlist = market.slice(0, 10);

  return {
    gameweek,
    captainCandidates,
    transferInCandidates,
    transferOutCandidates,
    watchlist,
  };
}

export function summarizeManagerSnapshot(
  entry: {
    id: number;
    player_first_name: string;
    player_last_name: string;
    name: string;
    summary_overall_points: number;
    summary_overall_rank: number | null;
    summary_event_points: number;
    current_event: number | null;
    favourite_team: number | null;
    leagues: { classic: Array<{ id: number; name: string; entry_rank?: number }> };
  },
  bootstrap: BootstrapStatic,
) {
  const favourite =
    entry.favourite_team != null
      ? getTeamShort(bootstrap, entry.favourite_team)
      : null;

  return {
    id: entry.id,
    managerName: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
    teamName: entry.name,
    overallPoints: entry.summary_overall_points,
    overallRank: entry.summary_overall_rank,
    eventPoints: entry.summary_event_points,
    currentEvent: entry.current_event,
    favouriteTeam: favourite,
    classicLeagues: entry.leagues.classic.slice(0, 8).map((l) => ({
      id: l.id,
      name: l.name,
      rank: l.entry_rank ?? null,
    })),
  };
}
