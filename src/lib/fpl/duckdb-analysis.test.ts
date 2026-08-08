import { describe, expect, it } from "vitest";

import { runFplAnalysis } from "./duckdb-analysis";
import type { BootstrapStatic, Fixture } from "./types";

const bootstrap: BootstrapStatic = {
  total_players: 2,
  events: [],
  element_types: [
    {
      id: 1,
      singular_name: "Goalkeeper",
      singular_name_short: "GKP",
      plural_name: "Goalkeepers",
      plural_name_short: "GKP",
    },
  ],
  teams: [
    {
      id: 1,
      name: "Alpha",
      short_name: "ALP",
      strength: 3,
      strength_attack_home: 3,
      strength_attack_away: 3,
      strength_defence_home: 3,
      strength_defence_away: 3,
    },
    {
      id: 2,
      name: "Beta",
      short_name: "BET",
      strength: 3,
      strength_attack_home: 3,
      strength_attack_away: 3,
      strength_defence_home: 3,
      strength_defence_away: 3,
    },
  ],
  elements: [
    {
      id: 11,
      web_name: "Alpha GK",
      first_name: "Alpha",
      second_name: "Goalkeeper",
      team: 1,
      element_type: 1,
      now_cost: 45,
      selected_by_percent: "10.0",
      form: "5.0",
      points_per_game: "4.2",
      total_points: 42,
      minutes: 900,
      goals_scored: 0,
      assists: 0,
      clean_sheets: 4,
      expected_goals: "0.0",
      expected_assists: "0.0",
      expected_goal_involvements: "0.0",
      ict_index: "10.0",
      influence: "1.0",
      creativity: "1.0",
      threat: "1.0",
      status: "a",
      news: "",
      chance_of_playing_next_round: null,
      chance_of_playing_this_round: null,
      ep_next: "4.5",
      ep_this: null,
    },
    {
      id: 22,
      web_name: "Beta GK",
      first_name: "Beta",
      second_name: "Goalkeeper",
      team: 2,
      element_type: 1,
      now_cost: 50,
      selected_by_percent: "5.0",
      form: "4.0",
      points_per_game: "3.8",
      total_points: 38,
      minutes: 900,
      goals_scored: 0,
      assists: 0,
      clean_sheets: 3,
      expected_goals: "0.0",
      expected_assists: "0.0",
      expected_goal_involvements: "0.0",
      ict_index: "8.0",
      influence: "1.0",
      creativity: "1.0",
      threat: "1.0",
      status: "a",
      news: "",
      chance_of_playing_next_round: null,
      chance_of_playing_this_round: null,
      ep_next: "3.5",
      ep_this: null,
    },
  ],
};

const fixtures: Fixture[] = [
  {
    id: 1,
    event: 2,
    team_h: 1,
    team_a: 2,
    team_h_difficulty: 2,
    team_a_difficulty: 4,
    kickoff_time: null,
    finished: false,
    started: false,
    team_h_score: null,
    team_a_score: null,
  },
];

describe("runFplAnalysis", () => {
  it("supports a fixture-difficulty ranking joined back to goalkeepers", async () => {
    const result = await runFplAnalysis({
      bootstrap,
      fixtures,
      beliefs: new Map([
        [11, { formBelief: 1, minutesRisk: 0.1, confidence: 0.8 }],
      ]),
      sql: `
        WITH schedule AS (
          SELECT event, home_team_id AS team_id, home_difficulty AS difficulty FROM fixtures
          UNION ALL
          SELECT event, away_team_id AS team_id, away_difficulty AS difficulty FROM fixtures
        )
        SELECT p.web_name, AVG(s.difficulty) AS average_fdr, b.belief_delta
        FROM players p
        JOIN schedule s ON s.team_id = p.team_id
        LEFT JOIN player_beliefs b ON b.player_id = p.id
        WHERE p.position = 'GKP'
        GROUP BY ALL
        ORDER BY average_fdr
      `,
    });

    expect(result.rows).toEqual([
      {
        web_name: "Alpha GK",
        average_fdr: 2,
        belief_delta: 0.88,
      },
      { web_name: "Beta GK", average_fdr: 4, belief_delta: null },
    ]);
  });
});
