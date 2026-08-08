import { and, desc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  formTheses,
  type FormThesisPreferences,
  type FormThesisStatus,
} from "@/db/schema";

import {
  listBeliefsForThesis,
  getBeliefMapForThesis,
  serializeBelief,
  type PlayerBeliefView,
} from "./beliefs";

export type FormThesisRow = typeof formTheses.$inferSelect;

export type FormThesisView = {
  id: string;
  title: string;
  status: FormThesisStatus;
  summary: string | null;
  preferences: FormThesisPreferences | null;
  gameweek: number | null;
  horizonGw: number;
  linkedDraftId: string | null;
  createdAt: string;
  updatedAt: string;
  beliefCount?: number;
  beliefs?: PlayerBeliefView[];
};

const WORKING_STATUSES: FormThesisStatus[] = [
  "collecting",
  "synthesized",
  "applied",
];

export function serializeThesis(
  row: FormThesisRow,
  extras?: { beliefCount?: number; beliefs?: PlayerBeliefView[] },
): FormThesisView {
  return {
    id: row.id,
    title: row.title,
    status: row.status as FormThesisStatus,
    summary: row.summary,
    preferences: row.preferences ?? null,
    gameweek: row.gameweek,
    horizonGw: row.horizonGw,
    linkedDraftId: row.linkedDraftId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    beliefCount: extras?.beliefCount,
    beliefs: extras?.beliefs,
  };
}

export async function listUserTheses(userId: string, limit = 20) {
  return db
    .select()
    .from(formTheses)
    .where(eq(formTheses.userId, userId))
    .orderBy(desc(formTheses.updatedAt))
    .limit(limit);
}

export async function getUserThesis(userId: string, thesisId: string) {
  const [row] = await db
    .select()
    .from(formTheses)
    .where(and(eq(formTheses.id, thesisId), eq(formTheses.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Most recently updated working thesis (not archived). */
export async function getActiveThesis(userId: string) {
  const [row] = await db
    .select()
    .from(formTheses)
    .where(
      and(
        eq(formTheses.userId, userId),
        inArray(formTheses.status, WORKING_STATUSES),
      ),
    )
    .orderBy(desc(formTheses.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getThesisWithBeliefs(userId: string, thesisId: string) {
  const row = await getUserThesis(userId, thesisId);
  if (!row) return null;
  const beliefRows = await listBeliefsForThesis(userId, thesisId);
  return {
    thesis: serializeThesis(row, {
      beliefCount: beliefRows.length,
      beliefs: beliefRows.map(serializeBelief),
    }),
    beliefRows,
  };
}

/** Belief map for the user's active working thesis (if any). */
export async function getActiveBeliefMap(userId: string) {
  const thesis = await getActiveThesis(userId);
  if (!thesis) return new Map();
  return getBeliefMapForThesis(userId, thesis.id);
}

export async function createFormThesis(params: {
  userId: string;
  title: string;
  gameweek?: number | null;
  horizonGw?: number;
  archiveOthers?: boolean;
}) {
  const now = new Date();
  if (params.archiveOthers !== false) {
    await db
      .update(formTheses)
      .set({ status: "archived", updatedAt: now })
      .where(
        and(
          eq(formTheses.userId, params.userId),
          inArray(formTheses.status, ["collecting", "synthesized"]),
        ),
      );
  }

  const id = crypto.randomUUID();
  const [row] = await db
    .insert(formTheses)
    .values({
      id,
      userId: params.userId,
      title: params.title.trim(),
      status: "collecting",
      summary: null,
      preferences: null,
      gameweek: params.gameweek ?? null,
      horizonGw: Math.max(1, Math.min(10, params.horizonGw ?? 3)),
      linkedDraftId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

const DEFAULT_THESIS_TAG = "Active beliefs";

/**
 * Beliefs are first-class; a thesis is only a tag/bag for the active set.
 * Ensures one working tag exists so upsert can proceed without a create step.
 */
export async function ensureActiveThesisTag(params: {
  userId: string;
  title?: string;
  gameweek?: number | null;
  horizonGw?: number;
}) {
  const existing = await getActiveThesis(params.userId);
  if (existing) return { thesis: existing, created: false as const };

  const title = (params.title?.trim() || DEFAULT_THESIS_TAG).slice(0, 120);
  const thesis = await createFormThesis({
    userId: params.userId,
    title: title.length >= 3 ? title : DEFAULT_THESIS_TAG,
    gameweek: params.gameweek,
    horizonGw: params.horizonGw,
    archiveOthers: true,
  });
  return { thesis, created: true as const };
}

export async function synthesizeFormThesis(params: {
  userId: string;
  thesisId: string;
  summary: string;
  preferences?: FormThesisPreferences | null;
}) {
  const existing = await getUserThesis(params.userId, params.thesisId);
  if (!existing) return { row: null, error: "Thesis not found." as const };
  if (existing.status === "archived") {
    return { row: null, error: "Cannot synthesize an archived thesis." as const };
  }

  const now = new Date();
  const [row] = await db
    .update(formTheses)
    .set({
      status: "synthesized",
      summary: params.summary.trim(),
      preferences: params.preferences ?? existing.preferences,
      updatedAt: now,
    })
    .where(
      and(
        eq(formTheses.id, params.thesisId),
        eq(formTheses.userId, params.userId),
        ne(formTheses.status, "archived"),
      ),
    )
    .returning();
  return { row: row ?? null, error: null };
}

export async function markThesisApplied(params: {
  userId: string;
  thesisId: string;
  linkedDraftId?: string | null;
}) {
  const now = new Date();
  const [row] = await db
    .update(formTheses)
    .set({
      status: "applied",
      linkedDraftId: params.linkedDraftId ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(formTheses.id, params.thesisId),
        eq(formTheses.userId, params.userId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function archiveFormThesis(userId: string, thesisId: string) {
  const now = new Date();
  const [row] = await db
    .update(formTheses)
    .set({ status: "archived", updatedAt: now })
    .where(and(eq(formTheses.id, thesisId), eq(formTheses.userId, userId)))
    .returning();
  return row ?? null;
}
