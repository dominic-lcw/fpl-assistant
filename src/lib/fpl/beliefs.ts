import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { formTheses, playerBeliefs } from "@/db/schema";

/** Cap |formBelief| stored and used in scoring. */
export const MAX_ABS_FORM_BELIEF = 2;
/** Cap |beliefDelta| applied to recommendationScore. */
export const MAX_ABS_BELIEF_DELTA = 4;
export const FORM_BELIEF_WEIGHT = 1.4;
export const MINUTES_RISK_WEIGHT = 3;
/** Default expiry when horizonGw is set and no explicit expiresAt. */
export const DEFAULT_HORIZON_GW = 3;
/** Rough days per gameweek for soft expiry. */
const DAYS_PER_GW = 7;

export type PlayerBeliefAdjustment = {
  formBelief: number;
  minutesRisk: number;
  confidence: number;
};

export type PlayerBeliefView = {
  id: string;
  thesisId: string;
  elementId: number;
  formBelief: number;
  minutesRisk: number;
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
