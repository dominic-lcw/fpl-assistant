import type { PlayerFormSummary, SquadPlayerSummary } from "./types";

export type CompactSuggestionPlayer = {
  id: number;
  name: string;
  team: string;
  position: string;
  cost: number;
  form: number;
  ppg: number;
  totalPoints: number;
  xgi: number;
  ownership: number;
  fixtureRunScore: number;
  score: number;
  nextFixtures: Array<{
    event: number | null;
    opponent: string;
    isHome: boolean;
    difficulty: number;
  }>;
  fixturesLabel: string;
  status: string;
  news?: string;
  chanceOfPlayingNextRound: number | null;
  needsNewsCheck: boolean;
};

export type PlayerComparisonRow = {
  id: number;
  name: string;
  team: string;
  position: string;
  cost: number;
  form: number;
  xgi: number;
  ownership: number;
  fixtureRunScore: number;
  score: number;
  fixturesLabel: string;
  status: string;
  news?: string;
  why: string;
};

function fixturesLabel(
  fixtures: PlayerFormSummary["nextFixtures"],
  count = 3,
): string {
  return fixtures
    .slice(0, count)
    .map(
      (f) =>
        `${f.opponent}(${f.isHome ? "H" : "A"},FDR${f.difficulty})`,
    )
    .join(" · ");
}

export function toCompactSuggestionPlayer(
  p: PlayerFormSummary | SquadPlayerSummary,
): CompactSuggestionPlayer {
  const needsNewsCheck =
    p.status !== "a" ||
    Boolean(p.news?.trim()) ||
    (p.chanceOfPlayingNextRound != null &&
      p.chanceOfPlayingNextRound < 100);

  return {
    id: p.id,
    name: p.webName,
    team: p.teamShort,
    position: p.position,
    cost: p.cost,
    form: p.form,
    ppg: p.pointsPerGame,
    totalPoints: p.totalPoints,
    xgi: p.expectedGoalInvolvements,
    ownership: p.selectedByPercent,
    fixtureRunScore: p.fixtureRunScore,
    score: p.recommendationScore,
    nextFixtures: p.nextFixtures.slice(0, 3),
    fixturesLabel: fixturesLabel(p.nextFixtures),
    status: p.status,
    news: p.news || undefined,
    chanceOfPlayingNextRound: p.chanceOfPlayingNextRound,
    needsNewsCheck,
  };
}

function whyLead(
  player: PlayerFormSummary,
  peers: PlayerFormSummary[],
): string {
  const others = peers.filter((p) => p.id !== player.id);
  if (others.length === 0) {
    return `Highest heuristic score (${player.recommendationScore.toFixed(1)}) from form, xGI, and fixtures.`;
  }

  const bestForm = Math.max(...peers.map((p) => p.form));
  const bestXgi = Math.max(...peers.map((p) => p.expectedGoalInvolvements));
  const bestFixtures = Math.max(...peers.map((p) => p.fixtureRunScore));

  const reasons: string[] = [];
  if (player.form === bestForm) {
    reasons.push(`best form ${player.form.toFixed(1)}`);
  }
  if (player.expectedGoalInvolvements === bestXgi) {
    reasons.push(`best season xGI ${player.expectedGoalInvolvements.toFixed(2)}`);
  }
  if (player.fixtureRunScore === bestFixtures) {
    reasons.push(`easiest upcoming run (${player.fixtureRunScore.toFixed(1)})`);
  }
  if (player.status !== "a") {
    reasons.push(`availability risk (${player.status})`);
  } else if (
    player.chanceOfPlayingNextRound != null &&
    player.chanceOfPlayingNextRound < 100
  ) {
    reasons.push(`${player.chanceOfPlayingNextRound}% chance next GW`);
  }

  if (reasons.length === 0) {
    return `Leads on blended score ${player.recommendationScore.toFixed(1)} (form ${player.form.toFixed(1)}, xGI ${player.expectedGoalInvolvements.toFixed(2)}, fixtures ${player.fixtureRunScore.toFixed(1)}).`;
  }
  return `Leads because: ${reasons.join("; ")}.`;
}

export function buildComparisonRows(
  players: Array<PlayerFormSummary | SquadPlayerSummary>,
  limit = 3,
): PlayerComparisonRow[] {
  const slice = players.slice(0, limit);
  return slice.map((p) => ({
    id: p.id,
    name: p.webName,
    team: p.teamShort,
    position: p.position,
    cost: p.cost,
    form: p.form,
    xgi: p.expectedGoalInvolvements,
    ownership: p.selectedByPercent,
    fixtureRunScore: p.fixtureRunScore,
    score: p.recommendationScore,
    fixturesLabel: fixturesLabel(p.nextFixtures),
    status: p.status,
    news: p.news || undefined,
    why: whyLead(p, slice),
  }));
}

export function researchTargetsFromSuggestions(params: {
  captains: CompactSuggestionPlayer[];
  transferOut: CompactSuggestionPlayer[];
  transferIn: CompactSuggestionPlayer[];
}): string[] {
  const flagged = [
    ...params.captains,
    ...params.transferOut,
    ...params.transferIn,
  ].filter((p) => p.needsNewsCheck);

  const unique = new Map<number, string>();
  for (const p of flagged) {
    unique.set(
      p.id,
      `${p.name} (${p.team}) — status ${p.status}${p.news ? `: ${p.news}` : ""}`,
    );
  }
  return [...unique.values()].slice(0, 6);
}
