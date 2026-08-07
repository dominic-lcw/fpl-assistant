export type DraftPosition = "GKP" | "DEF" | "MID" | "FWD";

export type DraftPickView = {
  elementId: number;
  webName: string;
  teamShort: string;
  position: DraftPosition;
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
};

export type DraftSummary = {
  id: string | null;
  title: string;
  mode: "draft_100" | "wildcard";
  status: "draft" | "active" | "archived" | "ephemeral";
  budget: number;
  bank: number;
  cost: number;
  managerId: number | null;
  gameweek: number | null;
  picks: DraftPickView[];
  averageScore?: number;
  valid?: boolean;
  notes?: string | null;
  updatedAt?: string | null;
};

export type DraftListItem = {
  id: string;
  title: string;
  mode: "draft_100" | "wildcard";
  status: string;
  budget: number;
  cost: number;
  bank: number;
  gameweek: number | null;
  managerId: number | null;
  pickCount: number;
  updatedAt: string;
};

const POSITION_SET = new Set<DraftPosition>(["GKP", "DEF", "MID", "FWD"]);

function asPosition(value: unknown): DraftPosition {
  if (typeof value === "string" && POSITION_SET.has(value as DraftPosition)) {
    return value as DraftPosition;
  }
  return "MID";
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize API draft picks or compact tool picks into one view model. */
export function normalizePick(raw: Record<string, unknown>): DraftPickView {
  const elementId = num(raw.elementId ?? raw.id);
  return {
    elementId,
    webName: String(raw.webName ?? raw.name ?? `Player ${elementId}`),
    teamShort: String(raw.teamShort ?? raw.team ?? "???"),
    position: asPosition(raw.position),
    cost: num(raw.cost),
    pickPosition: num(raw.pickPosition, 0),
    isCaptain: Boolean(raw.isCaptain),
    isViceCaptain: Boolean(raw.isViceCaptain),
    form: num(raw.form),
    pointsPerGame: num(raw.pointsPerGame ?? raw.ppg),
    totalPoints: num(raw.totalPoints),
    fixtureRunScore: num(raw.fixtureRunScore),
    recommendationScore: num(raw.recommendationScore ?? raw.score),
    status: String(raw.status ?? "a"),
  };
}

export function picksByPosition(picks: DraftPickView[]) {
  const groups: Record<DraftPosition, DraftPickView[]> = {
    GKP: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const pick of picks) {
    groups[pick.position].push(pick);
  }
  for (const key of Object.keys(groups) as DraftPosition[]) {
    groups[key].sort(
      (a, b) =>
        a.pickPosition - b.pickPosition ||
        b.recommendationScore - a.recommendationScore,
    );
  }
  return groups;
}

export function draftFromSuggestResult(
  result: Record<string, unknown>,
): DraftSummary | null {
  if (result.error || !Array.isArray(result.picks)) return null;
  const saved =
    result.saved && typeof result.saved === "object"
      ? (result.saved as Record<string, unknown>)
      : null;
  const picks = (result.picks as Record<string, unknown>[]).map(normalizePick);
  const mode = result.mode === "wildcard" ? "wildcard" : "draft_100";
  return {
    id: saved && typeof saved.id === "string" ? saved.id : null,
    title:
      (saved && typeof saved.title === "string" && saved.title) ||
      (mode === "draft_100" ? "£100m draft" : "Wildcard draft"),
    mode,
    status: saved ? "draft" : "ephemeral",
    budget: num(result.budget ?? saved?.budget, 100),
    bank: num(result.bank ?? saved?.bank),
    cost: num(result.cost ?? saved?.cost),
    managerId:
      result.managerId != null
        ? num(result.managerId)
        : saved?.managerId != null
          ? num(saved.managerId)
          : null,
    gameweek:
      result.gameweek &&
      typeof result.gameweek === "object" &&
      result.gameweek !== null &&
      "id" in result.gameweek
        ? num((result.gameweek as { id: unknown }).id)
        : result.gameweek != null
          ? num(result.gameweek)
          : null,
    picks,
    averageScore:
      result.averageScore != null ? num(result.averageScore) : undefined,
    valid: result.valid != null ? Boolean(result.valid) : undefined,
    notes: null,
    updatedAt:
      saved && typeof saved.updatedAt === "string" ? saved.updatedAt : null,
  };
}

export function draftFromApi(raw: Record<string, unknown>): DraftSummary {
  const picks = Array.isArray(raw.picks)
    ? (raw.picks as Record<string, unknown>[]).map(normalizePick)
    : [];
  return {
    id: typeof raw.id === "string" ? raw.id : null,
    title: String(raw.title ?? "Draft"),
    mode: raw.mode === "wildcard" ? "wildcard" : "draft_100",
    status:
      raw.status === "active" || raw.status === "archived"
        ? raw.status
        : "draft",
    budget: num(raw.budget, 100),
    bank: num(raw.bank),
    cost: num(raw.cost),
    managerId: raw.managerId != null ? num(raw.managerId) : null,
    gameweek: raw.gameweek != null ? num(raw.gameweek) : null,
    picks,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}
