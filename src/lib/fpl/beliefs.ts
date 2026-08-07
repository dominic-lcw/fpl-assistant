import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { formTheses, playerBeliefs } from "@/db/schema";

/** Cap |formBelief| stored and used in scoring. */
export const MAX_ABS_FORM_BELIEF = 2;
/** Cap |beliefDelta| applied to recommendationScore. */
export const MAX_ABS_BELIEF_DELTA = 4;
export const FORM_BELIEF_WEIGHT = 1.4;
export const MINUTES_RISK_WEIGHT = 3;
/**
 * How many expected points per GW one formBelief unit adds/subtracts
 * before minutes risk (form is roughly a 0–10 scale).
 */
export const FORM_BELIEF_EP_WEIGHT = 0.75;
/** Default expiry when horizonGw is set and no explicit expiresAt. */
export const DEFAULT_HORIZON_GW = 3;
/** Rough days per gameweek for soft expiry. */
const DAYS_PER_GW = 7;

export type PlayerBeliefAdjustment = {
  formBelief: number;
  minutesRisk: number;
  confidence: number;
};

/** Official FPL baseline inputs for expected-points calculation. */
export type BeliefEpBaseline = {
  /** FPL ep_next when present. */
  epNext: number;
  form: number;
  pointsPerGame: number;
};

export type BeliefExpectation = {
  /** Official / blended expected points per GW before belief adjustment. */
  baselinePerGw: number;
  /** Belief-adjusted expected points per GW after minutes risk. */
  adjustedPerGw: number;
  /** Quantified expected points over horizonGw. */
  expectedPoints: number;
  /** Suggested upside band (points over horizon). */
  suggestedCeiling: number;
  /** Suggested downside band (points over horizon). */
  suggestedFloor: number;
  horizonGw: number;
  formBelief: number;
  minutesRisk: number;
  confidence: number;
  formula: string;
};

export type PlayerBeliefView = {
  id: string;
  thesisId: string;
  elementId: number;
  formBelief: number;
  minutesRisk: number;
  /** Quantified expected points over horizonGw (from calculation). */
  expectedPoints: number | null;
  ceiling: number | null;
  floor: number | null;
  confidence: number;
  horizonGw: number;
  rationale: string;
  sources: string[];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  beliefDelta: number;
  /** Optional enrichment for UI / tools. */
  name?: string;
  team?: string;
  position?: string;
};

export type PlayerBeliefRow = typeof playerBeliefs.$inferSelect;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeBeliefScoreDelta(
  belief: PlayerBeliefAdjustment,
): number {
  const formBelief = clamp(
    belief.formBelief,
    -MAX_ABS_FORM_BELIEF,
    MAX_ABS_FORM_BELIEF,
  );
  const minutesRisk = clamp(belief.minutesRisk, 0, 1);
  const confidence = clamp(belief.confidence, 0, 1);
  const raw =
    formBelief * confidence * FORM_BELIEF_WEIGHT -
    minutesRisk * confidence * MINUTES_RISK_WEIGHT;
  return Number(
    clamp(raw, -MAX_ABS_BELIEF_DELTA, MAX_ABS_BELIEF_DELTA).toFixed(2),
  );
}

function numBaseline(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Blend official FPL expected points into a per-GW baseline.
 * Prefer ep_next; fall back to form/ppg when ep_next is missing.
 */
export function baselineExpectedPointsPerGw(
  baseline: BeliefEpBaseline,
): number {
  const epNext = numBaseline(baseline.epNext);
  if (epNext > 0) return Number(epNext.toFixed(2));
  const form = numBaseline(baseline.form);
  const ppg = numBaseline(baseline.pointsPerGame);
  if (form <= 0 && ppg <= 0) return 0;
  if (form <= 0) return Number(ppg.toFixed(2));
  if (ppg <= 0) return Number(form.toFixed(2));
  return Number((form * 0.55 + ppg * 0.45).toFixed(2));
}

/**
 * Quantify a belief as expected points over its horizon.
 * Uses FPL baseline EP + formBelief adjustment − minutes risk, scaled by confidence.
 */
export function computeBeliefExpectation(
  baseline: BeliefEpBaseline,
  belief: PlayerBeliefAdjustment & { horizonGw?: number },
): BeliefExpectation {
  const formBelief = clamp(
    belief.formBelief,
    -MAX_ABS_FORM_BELIEF,
    MAX_ABS_FORM_BELIEF,
  );
  const minutesRisk = clamp(belief.minutesRisk, 0, 1);
  const confidence = clamp(belief.confidence, 0, 1);
  const horizonGw = Math.max(
    1,
    Math.min(10, Math.round(belief.horizonGw ?? DEFAULT_HORIZON_GW)),
  );

  const baselinePerGw = baselineExpectedPointsPerGw(baseline);
  const formAdj =
    formBelief * confidence * FORM_BELIEF_EP_WEIGHT;
  const minutesFactor = 1 - minutesRisk * confidence;
  const adjustedPerGw = Number(
    Math.max(0, (baselinePerGw + formAdj) * minutesFactor).toFixed(2),
  );
  const expectedPoints = Number((adjustedPerGw * horizonGw).toFixed(2));

  // Wider bands when confidence is low.
  const spread = Number(((1 - confidence) * 0.35 + 0.12).toFixed(3));
  const suggestedCeiling = Number(
    (expectedPoints * (1 + spread)).toFixed(2),
  );
  const suggestedFloor = Number(
    Math.max(0, expectedPoints * (1 - spread)).toFixed(2),
  );

  return {
    baselinePerGw,
    adjustedPerGw,
    expectedPoints,
    suggestedCeiling,
    suggestedFloor,
    horizonGw,
    formBelief,
    minutesRisk,
    confidence,
    formula:
      "expectedPoints = max(0, (baselinePerGw + formBelief×confidence×0.75) × (1 − minutesRisk×confidence)) × horizonGw",
  };
}

export function serializeBelief(row: PlayerBeliefRow): PlayerBeliefView {
  const formBelief = Number(row.formBelief);
  const minutesRisk = Number(row.minutesRisk);
  const confidence = Number(row.confidence);
  return {
    id: row.id,
    thesisId: row.thesisId,
    elementId: row.elementId,
    formBelief,
    minutesRisk,
    expectedPoints:
      row.expectedPoints == null ? null : Number(row.expectedPoints),
    ceiling: row.ceiling == null ? null : Number(row.ceiling),
    floor: row.floor == null ? null : Number(row.floor),
    confidence,
    horizonGw: row.horizonGw,
    rationale: row.rationale,
    sources: row.sources ?? [],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    beliefDelta: computeBeliefScoreDelta({
      formBelief,
      minutesRisk,
      confidence,
    }),
  };
}

function defaultExpiresAt(horizonGw: number, from = new Date()): Date {
  const days = Math.max(1, horizonGw) * DAYS_PER_GW;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

function thesisBeliefWhere(
  userId: string,
  thesisId: string,
  now = new Date(),
) {
  return and(
    eq(playerBeliefs.userId, userId),
    eq(playerBeliefs.thesisId, thesisId),
    or(isNull(playerBeliefs.expiresAt), gt(playerBeliefs.expiresAt, now)),
  );
}

export async function listBeliefsForThesis(
  userId: string,
  thesisId: string,
  limit = 50,
) {
  return db
    .select()
    .from(playerBeliefs)
    .where(thesisBeliefWhere(userId, thesisId))
    .orderBy(desc(playerBeliefs.updatedAt))
    .limit(limit);
}

export async function getBeliefForThesis(
  userId: string,
  thesisId: string,
  elementId: number,
) {
  const [row] = await db
    .select()
    .from(playerBeliefs)
    .where(
      and(
        thesisBeliefWhere(userId, thesisId),
        eq(playerBeliefs.elementId, elementId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getBeliefMapForThesis(
  userId: string,
  thesisId: string,
): Promise<Map<number, PlayerBeliefAdjustment>> {
  const rows = await listBeliefsForThesis(userId, thesisId, 200);
  const map = new Map<number, PlayerBeliefAdjustment>();
  for (const row of rows) {
    map.set(row.elementId, {
      formBelief: Number(row.formBelief),
      minutesRisk: Number(row.minutesRisk),
      confidence: Number(row.confidence),
    });
  }
  return map;
}

export async function upsertUserPlayerBelief(params: {
  userId: string;
  thesisId: string;
  elementId: number;
  formBelief: number;
  minutesRisk?: number;
  expectedPoints?: number | null;
  ceiling?: number | null;
  floor?: number | null;
  confidence?: number;
  horizonGw?: number;
  rationale: string;
  sources?: string[];
  expiresAt?: Date | null;
}) {
  const now = new Date();
  const formBelief = clamp(
    params.formBelief,
    -MAX_ABS_FORM_BELIEF,
    MAX_ABS_FORM_BELIEF,
  );
  const minutesRisk = clamp(params.minutesRisk ?? 0, 0, 1);
  const confidence = clamp(params.confidence ?? 0.5, 0, 1);
  const horizonGw = Math.max(
    1,
    Math.min(10, Math.round(params.horizonGw ?? DEFAULT_HORIZON_GW)),
  );
  const expiresAt =
    params.expiresAt === undefined
      ? defaultExpiresAt(horizonGw, now)
      : params.expiresAt;

  const values = {
    id: crypto.randomUUID(),
    userId: params.userId,
    thesisId: params.thesisId,
    elementId: params.elementId,
    formBelief,
    minutesRisk,
    expectedPoints: params.expectedPoints ?? null,
    ceiling: params.ceiling ?? null,
    floor: params.floor ?? null,
    confidence,
    horizonGw,
    rationale: params.rationale.trim(),
    sources: params.sources ?? [],
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  const [row] = await db
    .insert(playerBeliefs)
    .values(values)
    .onConflictDoUpdate({
      target: [playerBeliefs.thesisId, playerBeliefs.elementId],
      set: {
        formBelief: values.formBelief,
        minutesRisk: values.minutesRisk,
        expectedPoints: values.expectedPoints,
        ceiling: values.ceiling,
        floor: values.floor,
        confidence: values.confidence,
        horizonGw: values.horizonGw,
        rationale: values.rationale,
        sources: values.sources,
        expiresAt: values.expiresAt,
        updatedAt: now,
      },
    })
    .returning();

  // Keep thesis working + reopen collection if a new belief arrives after synthesis.
  await db
    .update(formTheses)
    .set({
      updatedAt: now,
      status: "collecting",
    })
    .where(
      and(
        eq(formTheses.id, params.thesisId),
        eq(formTheses.userId, params.userId),
      ),
    );

  return row;
}

export async function clearUserPlayerBelief(
  userId: string,
  thesisId: string,
  elementId: number,
) {
  const deleted = await db
    .delete(playerBeliefs)
    .where(
      and(
        eq(playerBeliefs.userId, userId),
        eq(playerBeliefs.thesisId, thesisId),
        eq(playerBeliefs.elementId, elementId),
      ),
    )
    .returning({
      id: playerBeliefs.id,
      elementId: playerBeliefs.elementId,
      thesisId: playerBeliefs.thesisId,
    });
  return deleted[0] ?? null;
}
