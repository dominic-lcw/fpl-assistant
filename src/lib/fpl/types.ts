export type PositionType = 1 | 2 | 3 | 4;

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
  average_entry_score: number | null;
}

export interface FplTeam {
  id: number;
  name: string;
  short_name: string;
  /** Overall strength; null in preseason before FPL publishes ratings. */
  strength: number | null;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface FplElementType {
  id: PositionType;
  singular_name: string;
  singular_name_short: string;
  plural_name: string;
  plural_name_short: string;
}

export interface FplElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: PositionType;
  now_cost: number;
  selected_by_percent: string;
  form: string;
  points_per_game: string;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  ict_index: string;
  influence: string;
  creativity: string;
  threat: string;
  status: string;
  news: string;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  ep_next: string | null;
  ep_this: string | null;
}

export interface BootstrapStatic {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
  total_players: number;
}

export interface Fixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
  started: boolean;
  team_h_score: number | null;
  team_a_score: number | null;
}

export interface LiveElementStats {
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  total_points: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
}

export interface LiveElement {
  id: number;
  stats: LiveElementStats;
}

export interface EventLive {
  elements: LiveElement[];
}

export interface ManagerLeague {
  id: number;
  name: string;
  short_name?: string;
  entry_rank?: number;
  entry_last_rank?: number;
}

export interface ManagerEntry {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string;
  summary_overall_points: number;
  summary_overall_rank: number | null;
  summary_event_points: number;
  summary_event_rank: number | null;
  current_event: number | null;
  favourite_team: number | null;
  started_event: number;
  leagues: {
    classic: ManagerLeague[];
    h2h: ManagerLeague[];
  };
}

export interface ManagerHistoryCurrent {
  event: number;
  points: number;
  total_points: number;
  rank: number | null;
  overall_rank: number | null;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface ManagerHistoryPast {
  season_name: string;
  total_points: number;
  rank: number;
}

export interface ManagerChip {
  name: string;
  time: string;
  event: number;
}

export interface ManagerHistory {
  current: ManagerHistoryCurrent[];
  past: ManagerHistoryPast[];
  chips: ManagerChip[];
}

export interface LeagueStanding {
  id: number;
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  last_rank: number;
  total: number;
  event_total: number;
}

export interface ClassicLeagueStandings {
  league: {
    id: number;
    name: string;
  };
  standings: {
    has_next: boolean;
    page: number;
    results: LeagueStanding[];
  };
}

export interface PlayerHistory {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string;
  team_h_score: number | null;
  team_a_score: number | null;
  round: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  value: number;
}

export interface PlayerUpcomingFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  is_home: boolean;
  difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
}

export interface PlayerHistoryPast {
  season_name: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
}

export interface ElementSummary {
  fixtures: PlayerUpcomingFixture[];
  history: PlayerHistory[];
  history_past: PlayerHistoryPast[];
}

export interface ManagerPick {
  element: number;
  position: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
}

export interface ManagerPicks {
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
  };
  picks: ManagerPick[];
}

export interface RelevantGameweek {
  id: number;
  name: string;
  kind: "current" | "next" | "previous" | "latest_finished" | "unavailable";
  deadline_time: string | null;
}

export interface PlayerFormSummary {
  id: number;
  webName: string;
  teamId: number;
  teamShort: string;
  position: string;
  cost: number;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  expectedGoalInvolvements: number;
  selectedByPercent: number;
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
  recentPoints: number;
  recentMinutes: number;
  recentXgi: number;
  fixtureRunScore: number;
  nextFixtures: Array<{
    event: number | null;
    opponent: string;
    isHome: boolean;
    difficulty: number;
  }>;
  recommendationScore: number;
  /** Score contribution from the signed-in user's form belief prior. */
  beliefDelta?: number;
  formBelief?: number;
  minutesRisk?: number;
  beliefConfidence?: number;
}

export interface SquadPlayerSummary extends PlayerFormSummary {
  pickPosition: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isBench: boolean;
  multiplier: number;
}

export interface RecommendationBundle {
  gameweek: RelevantGameweek;
  captainCandidates: SquadPlayerSummary[];
  transferInCandidates: PlayerFormSummary[];
  transferOutCandidates: SquadPlayerSummary[];
  watchlist: PlayerFormSummary[];
}
