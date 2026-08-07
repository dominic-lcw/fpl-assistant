import { describe, expect, it } from "vitest";

import {
  DRAFT_BUDGET_TENTHS,
  MAX_PER_CLUB,
  SQUAD_QUOTA,
  SQUAD_SIZE,
  buildLegalSquad,
  validateSquadPicks,
} from "@/lib/fpl/squad";
import type { SquadDraftPick as DraftPick } from "@/db/schema";
import type { BootstrapStatic, Fixture } from "@/lib/fpl/types";

function makeElement(
  id: number,
  team: number,
  element_type: 1 | 2 | 3 | 4,
  now_cost: number,
  form: string,
): BootstrapStatic["elements"][number] {
  return {
    id,
    web_name: `P${id}`,
    first_name: "P",
    second_name: String(id),
    team,
    element_type,
    now_cost,
    selected_by_percent: "1.0",
    form,
    points_per_game: form,
    total_points: Math.round(Number(form) * 10),
    minutes: 900,
    goals_scored: 0,
    assists: 0,
    clean_sheets: 0,
    expected_goals: "0.5",
    expected_assists: "0.5",
    expected_goal_involvements: "1.0",
    ict_index: "50",
    influence: "50",
    creativity: "50",
    threat: "50",
    status: "a",
    news: "",
    chance_of_playing_next_round: 100,
    chance_of_playing_this_round: 100,
    ep_next: form,
    ep_this: form,
  };
}

function buildBootstrap(): BootstrapStatic {
  const teams = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: `Team ${i + 1}`,
    short_name: `T${i + 1}`,
    strength: 3,
    strength_attack_home: 1000,
    strength_attack_away: 1000,
    strength_defence_home: 1000,
    strength_defence_away: 1000,
  }));

  const elements: BootstrapStatic["elements"] = [];
  let id = 1;
  // Plenty of cheap + premium options per position across clubs
  for (const team of teams) {
    // 2 GKP
    elements.push(makeElement(id++, team.id, 1, 40 + (team.id % 3), "3.0"));
    elements.push(makeElement(id++, team.id, 1, 50 + team.id, "5.0"));
    // 3 DEF
    elements.push(makeElement(id++, team.id, 2, 40, "2.5"));
    elements.push(makeElement(id++, team.id, 2, 45 + team.id, "4.5"));
    elements.push(makeElement(id++, team.id, 2, 55, "6.0"));
    // 3 MID
    elements.push(makeElement(id++, team.id, 3, 45, "3.0"));
    elements.push(makeElement(id++, team.id, 3, 70 + team.id, "7.0"));
    elements.push(makeElement(id++, team.id, 3, 90, "8.5"));
    // 2 FWD
    elements.push(makeElement(id++, team.id, 4, 45, "3.5"));
    elements.push(makeElement(id++, team.id, 4, 75 + team.id, "7.5"));
  }

  return {
    total_players: 1,
    events: [
      {
        id: 1,
        name: "Gameweek 1",
        deadline_time: "2026-08-01T00:00:00Z",
        finished: false,
        is_current: true,
        is_next: false,
        is_previous: false,
        average_entry_score: null,
      },
    ],
    teams,
    element_types: [
      {
        id: 1,
        singular_name: "Goalkeeper",
        singular_name_short: "GKP",
        plural_name: "Goalkeepers",
        plural_name_short: "GKP",
      },
      {
        id: 2,
        singular_name: "Defender",
        singular_name_short: "DEF",
        plural_name: "Defenders",
        plural_name_short: "DEF",
      },
      {
        id: 3,
        singular_name: "Midfielder",
        singular_name_short: "MID",
        plural_name: "Midfielders",
        plural_name_short: "MID",
      },
      {
        id: 4,
        singular_name: "Forward",
        singular_name_short: "FWD",
        plural_name: "Forwards",
        plural_name_short: "FWD",
      },
    ],
    elements,
  };
}

const fixtures: Fixture[] = [
  {
    id: 1,
    event: 1,
    team_h: 1,
    team_a: 2,
    team_h_difficulty: 2,
    team_a_difficulty: 4,
    kickoff_time: "2026-08-01T14:00:00Z",
    finished: false,
    started: false,
    team_h_score: null,
    team_a_score: null,
  },
];

describe("buildLegalSquad", () => {
  it("builds a valid £100m 15-player squad under FPL rules", () => {
    const bootstrap = buildBootstrap();
    const built = buildLegalSquad({
      bootstrap,
      fixtures,
      gameweek: {
        id: 1,
        name: "Gameweek 1",
        kind: "current",
        deadline_time: null,
      },
      mode: "draft_100",
      budgetTenths: DRAFT_BUDGET_TENTHS,
    });

    expect(built.valid).toBe(true);
    expect(built.issues).toEqual([]);
    expect(built.picks).toHaveLength(SQUAD_SIZE);
    expect(built.costTenths).toBeLessThanOrEqual(DRAFT_BUDGET_TENTHS);
    expect(built.bankTenths).toBe(DRAFT_BUDGET_TENTHS - built.costTenths);

    const quota = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const clubs = new Map<number, number>();
    for (const pick of built.picks) {
      quota[pick.elementType] += 1;
      clubs.set(pick.teamId, (clubs.get(pick.teamId) ?? 0) + 1);
    }
    expect(quota).toEqual(SQUAD_QUOTA);
    for (const count of clubs.values()) {
      expect(count).toBeLessThanOrEqual(MAX_PER_CLUB);
    }

    expect(built.picks.filter((p) => p.isCaptain)).toHaveLength(1);
    expect(built.picks.filter((p) => p.isViceCaptain)).toHaveLength(1);
    expect(built.picks.map((p) => p.pickPosition).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
  });

  it("surfaces belief-adjusted scores on selected picks", () => {
    const bootstrap = buildBootstrap();
    const premiumMid = bootstrap.elements.find(
      (e) => e.element_type === 3 && e.form === "8.5",
    );
    expect(premiumMid).toBeTruthy();

    const plain = buildLegalSquad({
      bootstrap,
      fixtures,
      gameweek: {
        id: 1,
        name: "Gameweek 1",
        kind: "current",
        deadline_time: null,
      },
      mode: "draft_100",
      budgetTenths: DRAFT_BUDGET_TENTHS,
    });
    const boosted = buildLegalSquad({
      bootstrap,
      fixtures,
      gameweek: {
        id: 1,
        name: "Gameweek 1",
        kind: "current",
        deadline_time: null,
      },
      mode: "draft_100",
      budgetTenths: DRAFT_BUDGET_TENTHS,
      beliefs: new Map([
        [
          premiumMid!.id,
          { formBelief: 2, minutesRisk: 0, confidence: 1 },
        ],
      ]),
    });

    const plainPick = plain.picks.find((p) => p.elementId === premiumMid!.id);
    const boostedPick = boosted.picks.find(
      (p) => p.elementId === premiumMid!.id,
    );
    expect(plainPick).toBeTruthy();
    expect(boostedPick).toBeTruthy();
    expect(boostedPick!.recommendationScore).toBeGreaterThan(
      plainPick!.recommendationScore,
    );
  });

  it("respects a tighter wildcard budget", () => {
    const bootstrap = buildBootstrap();
    const built = buildLegalSquad({
      bootstrap,
      fixtures,
      gameweek: {
        id: 1,
        name: "Gameweek 1",
        kind: "current",
        deadline_time: null,
      },
      mode: "wildcard",
      budgetTenths: 850,
    });

    expect(built.picks).toHaveLength(SQUAD_SIZE);
    expect(built.costTenths).toBeLessThanOrEqual(850);
    expect(built.valid).toBe(true);
  });
});

describe("validateSquadPicks", () => {
  it("flags position and club violations", () => {
    const picks = Array.from({ length: 15 }, (_, i) => ({
      elementId: i + 1,
      webName: `P${i + 1}`,
      teamId: 1,
      teamShort: "T1",
      position: "MID" as const,
      elementType: 3 as const,
      cost: 5,
      pickPosition: i + 1,
      isCaptain: i === 0,
      isViceCaptain: i === 1,
      form: 1,
      pointsPerGame: 1,
      totalPoints: 1,
      fixtureRunScore: 1,
      recommendationScore: 1,
      status: "a",
    })) satisfies DraftPick[];

    const issues = validateSquadPicks(picks, DRAFT_BUDGET_TENTHS);
    expect(issues.some((i) => i.code === "position_quota")).toBe(true);
    expect(issues.some((i) => i.code === "club_limit")).toBe(true);
  });
});
