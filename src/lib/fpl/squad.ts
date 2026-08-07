import type { SquadDraftPick } from "@/db/schema";

import { buildPlayerFormSummary } from "./analysis";
import type {
  BootstrapStatic,
  Fixture,
  PlayerFormSummary,
  PositionType,
  RelevantGameweek,
} from "./types";

export const SQUAD_QUOTA: Record<PositionType, number> = {
  1: 2, // GKP
  2: 5, // DEF
  3: 5, // MID
  4: 3, // FWD
};

export const MAX_PER_CLUB = 3;
export const DRAFT_BUDGET_TENTHS = 1000; // £100.0m
export const SQUAD_SIZE = 15;

export type SquadBuildMode = "draft_100" | "wildcard";

export type SquadValidationIssue = {
  code:
    | "size"
    | "budget"
    | "position_quota"
    | "club_limit"
    | "duplicate"
    | "unavailable";
  message: string;
};

export type BuiltSquad = {
  mode: SquadBuildMode;
  gameweek: RelevantGameweek;
  budgetTenths: number;
  costTenths: number;
  bankTenths: number;
  picks: SquadDraftPick[];
  valid: boolean;
  issues: SquadValidationIssue[];
  averageScore: number;
};

const POSITION_SHORT: Record<PositionType, SquadDraftPick["position"]> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

/** Fill order: secure GKPs, then attack, then midfield depth, then defence. */
const FILL_ORDER: PositionType[] = [1, 4, 3, 2];

function positionTypeFromShort(
  position: string,
): PositionType | null {
  if (position === "GKP") return 1;
  if (position === "DEF") return 2;
  if (position === "MID") return 3;
  if (position === "FWD") return 4;
  return null;
}

function cheapestAvailable(
  pool: PlayerFormSummary[],
  elementType: PositionType,
  clubCounts: Map<number, number>,
  taken: Set<number>,
): PlayerFormSummary | null {
  const candidates = pool
    .filter(
      (p) =>
        !taken.has(p.id) &&
        positionTypeFromShort(p.position) === elementType &&
        (clubCounts.get(p.teamId) ?? 0) < MAX_PER_CLUB,
    )
    .sort((a, b) => a.cost - b.cost || b.recommendationScore - a.recommendationScore);
  return candidates[0] ?? null;
}

function minCostForRemainingSlots(
  pool: PlayerFormSummary[],
  remainingQuota: Record<PositionType, number>,
  clubCounts: Map<number, number>,
  taken: Set<number>,
): number | null {
  let total = 0;
  const simClubs = new Map(clubCounts);
  const simTaken = new Set(taken);

  for (const elementType of FILL_ORDER) {
    for (let i = 0; i < remainingQuota[elementType]; i++) {
      const cheap = cheapestAvailable(pool, elementType, simClubs, simTaken);
      if (!cheap) return null;
      total += Math.round(cheap.cost * 10);
      simTaken.add(cheap.id);
      simClubs.set(cheap.teamId, (simClubs.get(cheap.teamId) ?? 0) + 1);
    }
  }
  return total;
}

function toDraftPick(
  player: PlayerFormSummary,
  elementType: PositionType,
  pickPosition: number,
  isCaptain: boolean,
  isViceCaptain: boolean,
): SquadDraftPick {
  return {
    elementId: player.id,
    webName: player.webName,
    teamId: player.teamId,
    teamShort: player.teamShort,
    position: POSITION_SHORT[elementType],
    elementType,
    cost: player.cost,
    pickPosition,
    isCaptain,
    isViceCaptain,
    form: player.form,
    pointsPerGame: player.pointsPerGame,
    totalPoints: player.totalPoints,
    fixtureRunScore: player.fixtureRunScore,
    recommendationScore: player.recommendationScore,
    status: player.status,
  };
}

function assignPickPositions(picks: SquadDraftPick[]): SquadDraftPick[] {
  const byType: Record<PositionType, SquadDraftPick[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };
  for (const pick of picks) {
    byType[pick.elementType].push(pick);
  }
  for (const type of [1, 2, 3, 4] as PositionType[]) {
    byType[type].sort(
      (a, b) => b.recommendationScore - a.recommendationScore || b.cost - a.cost,
    );
  }

  // Starting XI heuristic: 1 GKP, 4 DEF, 4 MID, 2 FWD (4-4-2), rest bench.
  const starters: SquadDraftPick[] = [
    ...byType[1].slice(0, 1),
    ...byType[2].slice(0, 4),
    ...byType[3].slice(0, 4),
    ...byType[4].slice(0, 2),
  ];
  const starterIds = new Set(starters.map((p) => p.elementId));
  const bench = picks
    .filter((p) => !starterIds.has(p.elementId))
    .sort((a, b) => {
      // Bench order: GKP first, then by score.
      if (a.elementType === 1 && b.elementType !== 1) return -1;
      if (b.elementType === 1 && a.elementType !== 1) return 1;
      return b.recommendationScore - a.recommendationScore;
    });

  const ordered = [...starters, ...bench];
  const captain = [...starters].sort(
    (a, b) => b.recommendationScore - a.recommendationScore,
  )[0];
  const vice = [...starters]
    .filter((p) => p.elementId !== captain?.elementId)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)[0];

  return ordered.map((pick, index) => ({
    ...pick,
    pickPosition: index + 1,
    isCaptain: pick.elementId === captain?.elementId,
    isViceCaptain: pick.elementId === vice?.elementId,
  }));
}

export function validateSquadPicks(
  picks: SquadDraftPick[],
  budgetTenths: number,
): SquadValidationIssue[] {
  const issues: SquadValidationIssue[] = [];

  if (picks.length !== SQUAD_SIZE) {
    issues.push({
      code: "size",
      message: `Squad must have ${SQUAD_SIZE} players (got ${picks.length}).`,
    });
  }

  const ids = new Set<number>();
  for (const pick of picks) {
    if (ids.has(pick.elementId)) {
      issues.push({
        code: "duplicate",
        message: `Duplicate player id ${pick.elementId}.`,
      });
    }
    ids.add(pick.elementId);
  }

  const quota: Record<PositionType, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const clubs = new Map<number, number>();
  let costTenths = 0;

  for (const pick of picks) {
    quota[pick.elementType] += 1;
    clubs.set(pick.teamId, (clubs.get(pick.teamId) ?? 0) + 1);
    costTenths += Math.round(pick.cost * 10);
  }

  for (const type of [1, 2, 3, 4] as PositionType[]) {
    if (quota[type] !== SQUAD_QUOTA[type]) {
      issues.push({
        code: "position_quota",
        message: `Need ${SQUAD_QUOTA[type]} ${POSITION_SHORT[type]} (got ${quota[type]}).`,
      });
    }
  }

  for (const [teamId, count] of clubs) {
    if (count > MAX_PER_CLUB) {
      issues.push({
        code: "club_limit",
        message: `Club ${teamId} has ${count} players (max ${MAX_PER_CLUB}).`,
      });
    }
  }

  if (costTenths > budgetTenths) {
    issues.push({
      code: "budget",
      message: `Squad costs £${(costTenths / 10).toFixed(1)}m over budget £${(budgetTenths / 10).toFixed(1)}m.`,
    });
  }

  return issues;
}

/**
 * Greedy legal 15-player builder using recommendationScore, with a
 * cheapest-remaining floor so the squad stays inside budget and club limits.
 */
export function buildLegalSquad(params: {
  bootstrap: BootstrapStatic;
  fixtures: Fixture[];
  gameweek: RelevantGameweek;
  mode: SquadBuildMode;
  budgetTenths: number;
}): BuiltSquad {
  const fromEvent = params.gameweek.id > 0 ? params.gameweek.id : 1;
  const pool = params.bootstrap.elements
    .filter((e) => e.status === "a" || e.status === "d")
    .map((e) =>
      buildPlayerFormSummary(e, params.bootstrap, params.fixtures, fromEvent),
    )
    .filter((p) => p.cost > 0)
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  const remainingQuota: Record<PositionType, number> = { ...SQUAD_QUOTA };
  const clubCounts = new Map<number, number>();
  const taken = new Set<number>();
  const selected: Array<{ player: PlayerFormSummary; elementType: PositionType }> =
    [];
  let spentTenths = 0;
  const issues: SquadValidationIssue[] = [];

  const slots = FILL_ORDER.flatMap((type) =>
    Array.from({ length: SQUAD_QUOTA[type] }, () => type),
  );

  for (const elementType of slots) {
    remainingQuota[elementType] -= 1;
    const floor =
      minCostForRemainingSlots(pool, remainingQuota, clubCounts, taken) ?? 0;
    const maxSpend = params.budgetTenths - spentTenths - floor;

    const candidates = pool.filter((p) => {
      if (taken.has(p.id)) return false;
      if (positionTypeFromShort(p.position) !== elementType) return false;
      if ((clubCounts.get(p.teamId) ?? 0) >= MAX_PER_CLUB) return false;
      const costTenths = Math.round(p.cost * 10);
      return costTenths <= maxSpend;
    });

    const pick =
      candidates[0] ??
      cheapestAvailable(pool, elementType, clubCounts, taken);

    if (!pick) {
      issues.push({
        code: "unavailable",
        message: `Could not fill a ${POSITION_SHORT[elementType]} slot within rules/budget.`,
      });
      break;
    }

    const costTenths = Math.round(pick.cost * 10);
    spentTenths += costTenths;
    taken.add(pick.id);
    clubCounts.set(pick.teamId, (clubCounts.get(pick.teamId) ?? 0) + 1);
    selected.push({ player: pick, elementType });
  }

  const unordered = selected.map(({ player, elementType }) =>
    toDraftPick(player, elementType, 0, false, false),
  );
  const picks = assignPickPositions(unordered);
  const validationIssues = [
    ...issues,
    ...validateSquadPicks(picks, params.budgetTenths),
  ];
  // Dedupe identical messages
  const seen = new Set<string>();
  const uniqueIssues = validationIssues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const costTenths = picks.reduce(
    (sum, p) => sum + Math.round(p.cost * 10),
    0,
  );
  const averageScore =
    picks.length === 0
      ? 0
      : picks.reduce((sum, p) => sum + p.recommendationScore, 0) / picks.length;

  return {
    mode: params.mode,
    gameweek: params.gameweek,
    budgetTenths: params.budgetTenths,
    costTenths,
    bankTenths: Math.max(0, params.budgetTenths - costTenths),
    picks,
    valid: uniqueIssues.length === 0 && picks.length === SQUAD_SIZE,
    issues: uniqueIssues,
    averageScore: Number(averageScore.toFixed(2)),
  };
}
