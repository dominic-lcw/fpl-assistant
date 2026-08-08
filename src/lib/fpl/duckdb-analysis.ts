import {
  computeBeliefScoreDelta,
  type PlayerBeliefAdjustment,
} from "./beliefs";
import type { BootstrapStatic, Fixture } from "./types";

/**
 * Load DuckDB only when analysis runs. A static import would pull the native
 * addon (and sibling libduckdb.so) into every `/api/chat` module load.
 */
async function loadDuckDBInstance() {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  return DuckDBInstance;
}

const DATABASE_OPTIONS = {
  allow_community_extensions: "false",
  allow_unsigned_extensions: "false",
  enable_external_access: "false",
  memory_limit: "256MB",
  threads: "2",
};

export const FPL_ANALYSIS_TABLES = {
  players:
    "One row per FPL player. Includes id, web_name, team_id, team, team_short, position, cost (GBP), form, points_per_game, total_points, minutes, goals_scored, assists, clean_sheets, expected_goals, expected_assists, expected_goal_involvements, selected_by_percent, status, chance_of_playing_next_round, and ep_next.",
  teams:
    "One row per Premier League team. Includes id, name, short_name, strength (null in preseason), and home/away attack and defence strengths.",
  fixtures:
    "One row per fixture. Includes event, home_team_id, home_team, away_team_id, away_team, home_difficulty, away_difficulty, kickoff_time, finished, and scores. Difficulty is 1 (easiest) to 5 (hardest).",
  player_beliefs:
    "The signed-in user's active player beliefs only. Includes player_id, form_belief, minutes_risk, confidence, and belief_delta. Empty when the user has no active beliefs.",
} as const;

type AnalysisInput = {
  bootstrap: BootstrapStatic;
  fixtures: Fixture[];
  beliefs?: Map<number, PlayerBeliefAdjustment>;
  sql: string;
  rowLimit?: number;
};

function appendNullableInteger(
  appender: {
    appendInteger(value: number): void;
    appendNull(): void;
  },
  value: number | null | undefined,
) {
  if (value == null || !Number.isFinite(value)) appender.appendNull();
  else appender.appendInteger(value);
}

function appendNullableDouble(
  appender: {
    appendDouble(value: number): void;
    appendNull(): void;
  },
  value: number | null | undefined,
) {
  if (value == null || !Number.isFinite(value)) appender.appendNull();
  else appender.appendDouble(value);
}

function appendVarchar(
  appender: {
    appendVarchar(value: string): void;
    appendNull(): void;
  },
  value: string | null | undefined,
) {
  if (value == null) appender.appendNull();
  else appender.appendVarchar(value);
}

/** Parse FPL string/number fields; non-finite → null for DuckDB. */
function toFiniteNumber(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Runs one arbitrary SQL analysis against a fresh, in-memory snapshot.
 * Every invocation gets independent DuckDB state; only the caller's active
 * beliefs are included in `player_beliefs`.
 */
export async function runFplAnalysis({
  bootstrap,
  fixtures,
  beliefs,
  sql,
  rowLimit = 200,
}: AnalysisInput) {
  const DuckDBInstance = await loadDuckDBInstance();
  const instance = await DuckDBInstance.create(":memory:", DATABASE_OPTIONS);
  const connection = await instance.connect();
  const teams = new Map(bootstrap.teams.map((team) => [team.id, team]));

  try {
    await connection.run(`
      CREATE TABLE players (
        id INTEGER, web_name VARCHAR, first_name VARCHAR, second_name VARCHAR,
        team_id INTEGER, team VARCHAR, team_short VARCHAR, position_id INTEGER,
        position VARCHAR, cost DOUBLE, form DOUBLE, points_per_game DOUBLE,
        total_points INTEGER, minutes INTEGER, goals_scored INTEGER, assists INTEGER,
        clean_sheets INTEGER, expected_goals DOUBLE, expected_assists DOUBLE,
        expected_goal_involvements DOUBLE, selected_by_percent DOUBLE, status VARCHAR,
        chance_of_playing_next_round INTEGER, ep_next DOUBLE
      );
      CREATE TABLE teams (
        id INTEGER, name VARCHAR, short_name VARCHAR, strength INTEGER,
        strength_attack_home INTEGER, strength_attack_away INTEGER,
        strength_defence_home INTEGER, strength_defence_away INTEGER
      );
      CREATE TABLE fixtures (
        id INTEGER, event INTEGER, home_team_id INTEGER, home_team VARCHAR,
        away_team_id INTEGER, away_team VARCHAR, home_difficulty INTEGER,
        away_difficulty INTEGER, kickoff_time VARCHAR, finished BOOLEAN,
        started BOOLEAN, home_score INTEGER, away_score INTEGER
      );
      CREATE TABLE player_beliefs (
        player_id INTEGER, form_belief DOUBLE, minutes_risk DOUBLE,
        confidence DOUBLE, belief_delta DOUBLE
      );
    `);

    const playerAppender = await connection.createAppender("players");
    for (const player of bootstrap.elements) {
      const team = teams.get(player.team);
      const position = bootstrap.element_types.find(
        (type) => type.id === player.element_type,
      );
      playerAppender.appendInteger(player.id);
      appendVarchar(playerAppender, player.web_name);
      appendVarchar(playerAppender, player.first_name);
      appendVarchar(playerAppender, player.second_name);
      playerAppender.appendInteger(player.team);
      appendVarchar(playerAppender, team?.name ?? String(player.team));
      appendVarchar(playerAppender, team?.short_name ?? String(player.team));
      playerAppender.appendInteger(player.element_type);
      appendVarchar(playerAppender, position?.singular_name_short ?? "UNK");
      appendNullableDouble(playerAppender, player.now_cost / 10);
      appendNullableDouble(playerAppender, toFiniteNumber(player.form));
      appendNullableDouble(
        playerAppender,
        toFiniteNumber(player.points_per_game),
      );
      appendNullableInteger(playerAppender, player.total_points);
      appendNullableInteger(playerAppender, player.minutes);
      appendNullableInteger(playerAppender, player.goals_scored);
      appendNullableInteger(playerAppender, player.assists);
      appendNullableInteger(playerAppender, player.clean_sheets);
      appendNullableDouble(
        playerAppender,
        toFiniteNumber(player.expected_goals),
      );
      appendNullableDouble(
        playerAppender,
        toFiniteNumber(player.expected_assists),
      );
      appendNullableDouble(
        playerAppender,
        toFiniteNumber(player.expected_goal_involvements),
      );
      appendNullableDouble(
        playerAppender,
        toFiniteNumber(player.selected_by_percent),
      );
      appendVarchar(playerAppender, player.status);
      appendNullableInteger(
        playerAppender,
        player.chance_of_playing_next_round,
      );
      appendNullableDouble(playerAppender, toFiniteNumber(player.ep_next));
      playerAppender.endRow();
    }
    playerAppender.closeSync();

    const teamAppender = await connection.createAppender("teams");
    for (const team of bootstrap.teams) {
      teamAppender.appendInteger(team.id);
      appendVarchar(teamAppender, team.name);
      appendVarchar(teamAppender, team.short_name);
      // FPL leaves overall strength null in preseason.
      appendNullableInteger(teamAppender, team.strength);
      appendNullableInteger(teamAppender, team.strength_attack_home);
      appendNullableInteger(teamAppender, team.strength_attack_away);
      appendNullableInteger(teamAppender, team.strength_defence_home);
      appendNullableInteger(teamAppender, team.strength_defence_away);
      teamAppender.endRow();
    }
    teamAppender.closeSync();

    const fixtureAppender = await connection.createAppender("fixtures");
    for (const fixture of fixtures) {
      fixtureAppender.appendInteger(fixture.id);
      appendNullableInteger(fixtureAppender, fixture.event);
      fixtureAppender.appendInteger(fixture.team_h);
      appendVarchar(
        fixtureAppender,
        teams.get(fixture.team_h)?.short_name ?? String(fixture.team_h),
      );
      fixtureAppender.appendInteger(fixture.team_a);
      appendVarchar(
        fixtureAppender,
        teams.get(fixture.team_a)?.short_name ?? String(fixture.team_a),
      );
      appendNullableInteger(fixtureAppender, fixture.team_h_difficulty);
      appendNullableInteger(fixtureAppender, fixture.team_a_difficulty);
      appendVarchar(fixtureAppender, fixture.kickoff_time);
      fixtureAppender.appendBoolean(Boolean(fixture.finished));
      fixtureAppender.appendBoolean(Boolean(fixture.started));
      appendNullableInteger(fixtureAppender, fixture.team_h_score);
      appendNullableInteger(fixtureAppender, fixture.team_a_score);
      fixtureAppender.endRow();
    }
    fixtureAppender.closeSync();

    const beliefAppender = await connection.createAppender("player_beliefs");
    for (const [playerId, belief] of beliefs ?? []) {
      beliefAppender.appendInteger(playerId);
      appendNullableDouble(beliefAppender, toFiniteNumber(belief.formBelief));
      appendNullableDouble(beliefAppender, toFiniteNumber(belief.minutesRisk));
      appendNullableDouble(beliefAppender, toFiniteNumber(belief.confidence));
      appendNullableDouble(
        beliefAppender,
        toFiniteNumber(computeBeliefScoreDelta(belief)),
      );
      beliefAppender.endRow();
    }
    beliefAppender.closeSync();

    const reader = await connection.runAndReadUntil(sql, rowLimit);
    return {
      rowLimit,
      rows: reader.getRowObjectsJson(),
      tables: FPL_ANALYSIS_TABLES,
    };
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
