export type ThesisBeliefView = {
  id: string;
  thesisId: string;
  elementId: number;
  name?: string;
  team?: string;
  position?: string;
  formBelief: number;
  minutesRisk: number;
  confidence: number;
  beliefDelta: number;
  expectedPoints: number | null;
  ceiling: number | null;
  floor: number | null;
  horizonGw: number;
  rationale: string;
  sources: string[];
};

export type ActiveThesisView = {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  gameweek: number | null;
  horizonGw: number;
  linkedDraftId: string | null;
  beliefCount: number;
  beliefs: ThesisBeliefView[];
};

function num(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeBelief(raw: Record<string, unknown>): ThesisBeliefView {
  return {
    id: String(raw.id ?? ""),
    thesisId: String(raw.thesisId ?? ""),
    elementId: num(raw.elementId),
    name: typeof raw.name === "string" ? raw.name : undefined,
    team: typeof raw.team === "string" ? raw.team : undefined,
    position: typeof raw.position === "string" ? raw.position : undefined,
    formBelief: num(raw.formBelief),
    minutesRisk: num(raw.minutesRisk),
    confidence: num(raw.confidence, 0.5),
    beliefDelta: num(raw.beliefDelta),
    expectedPoints: optionalNum(raw.expectedPoints),
    ceiling: optionalNum(raw.ceiling),
    floor: optionalNum(raw.floor),
    horizonGw: num(raw.horizonGw, 3),
    rationale: String(raw.rationale ?? ""),
    sources: Array.isArray(raw.sources)
      ? raw.sources.filter((s): s is string => typeof s === "string")
      : [],
  };
}

export function thesisFromToolResult(result: unknown): ActiveThesisView | null {
  if (!result || typeof result !== "object") return null;
  const root = result as Record<string, unknown>;
  const thesisRaw = (root.thesis ?? root) as Record<string, unknown>;
  if (!thesisRaw.id || !thesisRaw.title) return null;

  const beliefsRaw = Array.isArray(thesisRaw.beliefs)
    ? thesisRaw.beliefs
    : Array.isArray(root.beliefs)
      ? root.beliefs
      : [];

  const beliefs = beliefsRaw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map(normalizeBelief);

  if (
    beliefs.length === 0 &&
    root.belief &&
    typeof root.belief === "object"
  ) {
    beliefs.push(normalizeBelief(root.belief as Record<string, unknown>));
  }

  return {
    id: String(thesisRaw.id),
    title: String(thesisRaw.title),
    status: String(thesisRaw.status ?? "collecting"),
    summary: typeof thesisRaw.summary === "string" ? thesisRaw.summary : null,
    gameweek: thesisRaw.gameweek == null ? null : num(thesisRaw.gameweek),
    horizonGw: num(thesisRaw.horizonGw, 3),
    linkedDraftId:
      typeof thesisRaw.linkedDraftId === "string"
        ? thesisRaw.linkedDraftId
        : null,
    beliefCount: num(thesisRaw.beliefCount, beliefs.length),
    beliefs,
  };
}
