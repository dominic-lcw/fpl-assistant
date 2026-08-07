import { describe, expect, it } from "vitest";

import {
  buildPlayerFormSummary,
  buildRecommendations,
  getRelevantGameweek,
  scoreFixtureRun,
  summarizeRecentForm,
} from "@/lib/fpl/analysis";
import type {
  BootstrapStatic,
  Fixture,
  ManagerPicks,
} from "@/lib/fpl/types";
import {
  isValidManagerIdInput,
  parsePositiveInt,
} from "@/lib/fpl/validation";

const bootstrap = {
  total_players: 1,
  events: [
    {
      id: 1,
      name: "Gameweek 1",
      deadline_time: "2026-08-01T00:00:00Z",
      finished: true,
      is_current: false,
      is_next: false,
      is_previous: true,
      average_entry_score: 50,
    },
    {
      id: 2,
      name: "Gameweek 2",
      deadline_time: "2026-08-08T00:00:00Z",
      finished: false,
      is_current: true,
      is_next: false,
      is_previous: false,
      average_entry_score: null,
    },
  ],
  teams: [
    {
      id: 1,
      name: "Arsenal",
      short_name: "ARS",
      strength: 4,
      strength_attack_home: 1200,
      strength_attack_away: 1100,
      strength_defence_home: 1200,
      strength_defence_away: 1100,
    },
    {
      id: 2,
      name: "Brighton",
      short_name: "BHA",
      strength: 3,
      strength_attack_home: 1000,
      strength_attack_away: 1000,
      strength_defence_home: 1000,
      strength_defence_away: 1000,
    },
  ],
  element_types: [
    {
      id: 1,
      singular_name: "Goalkeeper",
      singular_name_short: "GKP",
      plural_name: "Goalkeepers",
      plural_name_short: "GKP",
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
  elements: [
    {
      id: 10,
      web_name: "Saka",
      first_name: "Bukayo",
      second_name: "Saka",
      team: 1,
      element_type: 3,
      now_cost: 100,
      selected_by_percent: "40.0",
      form: "7.5",
      points_per_game: "6.2",
      total_points: 50,
      minutes: 450,
      goals_scored: 4,
      assists: 3,
      clean_sheets: 0,
      expected_goals: "3.1",
      expected_assists: "2.4",
      expected_goal_involvements: "5.5",
      ict_index: "90.0",
      influence: "40",
      creativity: "30",
      threat: "20",
      status: "a",
      news: "",
      chance_of_playing_next_round: 100,
      chance_of_playing_this_round: 100,
      ep_next: "6.0",
      ep_this: "5.5",
    },
    {
      id: 20,
      web_name: "Injured",
      first_name: "Bad",
      second_name: "Form",
      team: 2,
      element_type: 4,
      now_cost: 70,
      selected_by_percent: "1.0",
      form: "1.0",
      points_per_game: "1.5",
      total_points: 8,
      minutes: 90,
      goals_scored: 0,
      assists: 0,
      clean_sheets: 0,
      expected_goals: "0.1",
      expected_assists: "0.0",
      expected_goal_involvements: "0.1",
      ict_index: "5.0",
      influence: "1",
      creativity: "1",
      threat: "1",
      status: "i",
      news: "Knee injury",
      chance_of_playing_next_round: 0,
      chance_of_playing_this_round: 0,
      ep_next: "0.0",
      ep_this: "0.0",
    },
    {
      id: 30,
      web_name: "Target",
      first_name: "Good",
      second_name: "Option",
      team: 1,
      element_type: 4,
      now_cost: 75,
      selected_by_percent: "5.0",
      form: "8.0",
      points_per_game: "7.0",
      total_points: 40,
      minutes: 400,
      goals_scored: 5,
      assists: 1,
      clean_sheets: 0,
      expected_goals: "4.0",
      expected_assists: "1.0",
      expected_goal_involvements: "5.0",
      ict_index: "80.0",
      influence: "30",
      creativity: "20",
      threat: "30",
      status: "a",
      news: "",
      chance_of_playing_next_round: 100,
      chance_of_playing_this_round: 100,
      ep_next: "7.0",
      ep_this: "6.5",
    },
  ],
} as BootstrapStatic;

const fixtures: Fixture[] = [
  {
    id: 1,
    event: 2,
    team_h: 1,
    team_a: 2,
    team_h_difficulty: 2,
    team_a_difficulty: 4,
    kickoff_time: "2026-08-09T14:00:00Z",
    finished: false,
    started: false,
    team_h_score: null,
    team_a_score: null,
  },
  {
    id: 2,
    event: 3,
    team_h: 2,
    team_a: 1,
    team_h_difficulty: 3,
    team_a_difficulty: 2,
    kickoff_time: "2026-08-16T14:00:00Z",
    finished: false,
    started: false,
    team_h_score: null,
    team_a_score: null,
  },
];

const picks: ManagerPicks = {
  active_chip: null,
  entry_history: {
    event: 2,
    points: 40,
    total_points: 80,
    rank: 1000,
    overall_rank: 5000,
    bank: 15,
    value: 1000,
    event_transfers: 0,
    event_transfers_cost: 0,
  },
  picks: [
    {
      element: 10,
      position: 1,
      is_captain: true,
      is_vice_captain: false,
      multiplier: 2,
    },
    {
      element: 20,
      position: 2,
      is_captain: false,
      is_vice_captain: true,
      multiplier: 1,
    },
  ],
};

describe("validation", () => {
  it("accepts positive integer manager IDs", () => {
    expect(isValidManagerIdInput("12345")).toBe(true);
    expect(isValidManagerIdInput("0")).toBe(false);
    expect(isValidManagerIdInput("12a")).toBe(false);
    expect(parsePositiveInt("42", "manager ID")).toBe(42);
    expect(() => parsePositiveInt("-1")).toThrow(/Invalid/);
  });
});

describe("gameweek selection", () => {
  it("prefers the current gameweek", () => {
    const gw = getRelevantGameweek(bootstrap);
    expect(gw.id).toBe(2);
    expect(gw.kind).toBe("current");
  });

  it("falls back when no flags are set", () => {
    const empty = {
      ...bootstrap,
      events: bootstrap.events.map((e) => ({
        ...e,
        is_current: false,
        is_next: false,
        is_previous: false,
        finished: e.id === 1,
      })),
    };
    expect(getRelevantGameweek(empty).kind).toBe("latest_finished");
  });
});

describe("form and fixture scoring", () => {
  it("summarizes recent history", () => {
    const summary = summarizeRecentForm(
      [
        {
          element: 10,
          fixture: 1,
          opponent_team: 2,
          total_points: 8,
          was_home: true,
          kickoff_time: "",
          team_h_score: 2,
          team_a_score: 0,
          round: 1,
          minutes: 90,
          goals_scored: 1,
          assists: 0,
          clean_sheets: 0,
          goals_conceded: 0,
          expected_goals: "0.8",
          expected_assists: "0.2",
          expected_goal_involvements: "1.0",
          influence: "0",
          creativity: "0",
          threat: "0",
          ict_index: "0",
          value: 100,
        },
        {
          element: 10,
          fixture: 2,
          opponent_team: 2,
          total_points: 6,
          was_home: false,
          kickoff_time: "",
          team_h_score: 1,
          team_a_score: 1,
          round: 2,
          minutes: 90,
          goals_scored: 0,
          assists: 1,
          clean_sheets: 0,
          goals_conceded: 1,
          expected_goals: "0.2",
          expected_assists: "0.5",
          expected_goal_involvements: "0.7",
          influence: "0",
          creativity: "0",
          threat: "0",
          ict_index: "0",
          value: 100,
        },
      ],
      5,
    );
    expect(summary.recentPoints).toBe(14);
    expect(summary.recentMinutes).toBe(180);
    expect(summary.recentXgi).toBeCloseTo(1.7);
  });

  it("scores easier fixture runs higher", () => {
    expect(scoreFixtureRun([2, 2, 2])).toBeGreaterThan(scoreFixtureRun([4, 5, 5]));
  });

  it("joins player and team metadata", () => {
    const summary = buildPlayerFormSummary(
      bootstrap.elements[0]!,
      bootstrap,
      fixtures,
      2,
    );
    expect(summary.teamShort).toBe("ARS");
    expect(summary.position).toBe("MID");
    expect(summary.nextFixtures[0]?.opponent).toBe("BHA");
    expect(summary.nextFixtures[0]?.difficulty).toBe(2);
  });

  it("applies private form beliefs to recommendationScore", () => {
    const base = buildPlayerFormSummary(
      bootstrap.elements[0]!,
      bootstrap,
      fixtures,
      2,
    );
    const boosted = buildPlayerFormSummary(
      bootstrap.elements[0]!,
      bootstrap,
      fixtures,
      2,
      undefined,
      { formBelief: 1.5, minutesRisk: 0, confidence: 1 },
    );
    expect(boosted.beliefDelta).toBeGreaterThan(0);
    expect(boosted.recommendationScore).toBeGreaterThan(base.recommendationScore);
    expect(boosted.recommendationScore - base.recommendationScore).toBeCloseTo(
      boosted.beliefDelta!,
    );
  });
});

describe("recommendations", () => {
  it("orders captain and transfer candidates by score", () => {
    const recs = buildRecommendations({ bootstrap, fixtures, picks });
    expect(recs.captainCandidates[0]?.id).toBe(10);
    expect(recs.transferOutCandidates.some((p) => p.id === 20)).toBe(true);
    expect(recs.transferInCandidates.some((p) => p.id === 30)).toBe(true);
    expect(recs.watchlist.every((p) => p.id !== 10 && p.id !== 20)).toBe(true);
  });

  it("lets user beliefs promote a market option", () => {
    const without = buildRecommendations({ bootstrap, fixtures, picks });
    const withBelief = buildRecommendations({
      bootstrap,
      fixtures,
      picks,
      beliefs: new Map([
        [30, { formBelief: 2, minutesRisk: 0, confidence: 1 }],
      ]),
    });
    const baseTarget = without.transferInCandidates.find((p) => p.id === 30);
    const boostedTarget = withBelief.transferInCandidates.find((p) => p.id === 30);
    expect(baseTarget).toBeTruthy();
    expect(boostedTarget).toBeTruthy();
    expect(boostedTarget!.recommendationScore).toBeGreaterThan(
      baseTarget!.recommendationScore,
    );
  });
});
