import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  squadDrafts,
  type SquadDraftPick,
} from "@/db/schema";

import type { BuiltSquad, SquadBuildMode } from "./squad";
import { validateSquadPicks } from "./squad";

export type SquadDraftRow = typeof squadDrafts.$inferSelect;

export function serializeDraft(row: SquadDraftRow) {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    status: row.status,
    budget: row.budgetTenths / 10,
    bank: row.bankTenths / 10,
    cost: row.costTenths / 10,
    managerId: row.managerId,
    gameweek: row.gameweek,
    picks: row.picks,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listUserDrafts(userId: string, limit = 20) {
  return db
    .select()
    .from(squadDrafts)
    .where(eq(squadDrafts.userId, userId))
    .orderBy(desc(squadDrafts.updatedAt))
    .limit(limit);
}

export async function getUserDraft(userId: string, draftId: string) {
  const [row] = await db
    .select()
    .from(squadDrafts)
    .where(and(eq(squadDrafts.id, draftId), eq(squadDrafts.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function saveBuiltSquadDraft(params: {
  userId: string;
  title: string;
  built: BuiltSquad;
  managerId?: number | null;
  notes?: string | null;
  status?: "draft" | "active" | "archived";
}) {
  const id = crypto.randomUUID();
  const now = new Date();
  const [row] = await db
    .insert(squadDrafts)
    .values({
      id,
      userId: params.userId,
      title: params.title,
      mode: params.built.mode,
      status: params.status ?? "draft",
      budgetTenths: params.built.budgetTenths,
      bankTenths: params.built.bankTenths,
      costTenths: params.built.costTenths,
      managerId: params.managerId ?? null,
      gameweek: params.built.gameweek.id || null,
      picks: params.built.picks,
      notes: params.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function upsertManualDraft(params: {
  userId: string;
  draftId?: string;
  title: string;
  mode: SquadBuildMode;
  budgetTenths: number;
  picks: SquadDraftPick[];
  managerId?: number | null;
  gameweek?: number | null;
  notes?: string | null;
  status?: "draft" | "active" | "archived";
}) {
  const issues = validateSquadPicks(params.picks, params.budgetTenths);
  const costTenths = params.picks.reduce(
    (sum, p) => sum + Math.round(p.cost * 10),
    0,
  );
  const bankTenths = Math.max(0, params.budgetTenths - costTenths);
  const now = new Date();

  if (params.draftId) {
    const existing = await getUserDraft(params.userId, params.draftId);
    if (!existing) {
      return { row: null, issues, error: "Draft not found." as const };
    }
    const [row] = await db
      .update(squadDrafts)
      .set({
        title: params.title,
        mode: params.mode,
        status: params.status ?? existing.status,
        budgetTenths: params.budgetTenths,
        bankTenths,
        costTenths,
        managerId: params.managerId ?? existing.managerId,
        gameweek: params.gameweek ?? existing.gameweek,
        picks: params.picks,
        notes: params.notes ?? existing.notes,
        updatedAt: now,
      })
      .where(
        and(
          eq(squadDrafts.id, params.draftId),
          eq(squadDrafts.userId, params.userId),
        ),
      )
      .returning();
    return { row, issues, error: null };
  }

  const id = crypto.randomUUID();
  const [row] = await db
    .insert(squadDrafts)
    .values({
      id,
      userId: params.userId,
      title: params.title,
      mode: params.mode,
      status: params.status ?? "draft",
      budgetTenths: params.budgetTenths,
      bankTenths,
      costTenths,
      managerId: params.managerId ?? null,
      gameweek: params.gameweek ?? null,
      picks: params.picks,
      notes: params.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { row, issues, error: null };
}

export async function deleteUserDraft(userId: string, draftId: string) {
  const deleted = await db
    .delete(squadDrafts)
    .where(and(eq(squadDrafts.id, draftId), eq(squadDrafts.userId, userId)))
    .returning({ id: squadDrafts.id });
  return deleted[0] ?? null;
}
