import { getApprovedUser } from "@/lib/access";
import {
  deleteUserDraft,
  getUserDraft,
  serializeDraft,
  upsertManualDraft,
} from "@/lib/fpl/drafts";
import { DRAFT_BUDGET_TENTHS } from "@/lib/fpl/squad";
import type { SquadDraftPick } from "@/db/schema";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  picks: z.array(z.record(z.string(), z.unknown())).optional(),
  budgetTenths: z.number().int().positive().optional(),
  mode: z.enum(["draft_100", "wildcard"]).optional(),
  managerId: z.number().int().positive().optional().nullable(),
  gameweek: z.number().int().positive().optional().nullable(),
});

export async function GET(_req: Request, context: RouteContext) {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const row = await getUserDraft(user.id, id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ draft: serializeDraft(row) });
}

export async function PATCH(req: Request, context: RouteContext) {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const existing = await getUserDraft(user.id, id);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await upsertManualDraft({
    userId: user.id,
    draftId: id,
    title: parsed.data.title ?? existing.title,
    mode: parsed.data.mode ?? existing.mode,
    budgetTenths:
      parsed.data.budgetTenths ??
      existing.budgetTenths ??
      DRAFT_BUDGET_TENTHS,
    picks: (parsed.data.picks as unknown as SquadDraftPick[] | undefined) ??
      existing.picks,
    managerId:
      parsed.data.managerId === undefined
        ? existing.managerId
        : parsed.data.managerId,
    gameweek:
      parsed.data.gameweek === undefined
        ? existing.gameweek
        : parsed.data.gameweek,
    notes:
      parsed.data.notes === undefined ? existing.notes : parsed.data.notes,
    status: parsed.data.status,
  });

  if (!result.row) {
    return Response.json({ error: result.error ?? "Update failed" }, { status: 404 });
  }

  return Response.json({
    draft: serializeDraft(result.row),
    issues: result.issues,
  });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const deleted = await deleteUserDraft(user.id, id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ deleted: deleted.id });
}
