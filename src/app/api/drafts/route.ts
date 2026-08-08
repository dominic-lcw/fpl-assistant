import { getApprovedUser } from "@/lib/access";
import {
  getActiveBeliefMap,
  getActiveThesis,
  markThesisApplied,
} from "@/lib/fpl/theses";
import {
  listUserDrafts,
  saveBuiltSquadDraft,
  serializeDraft,
  upsertManualDraft,
} from "@/lib/fpl/drafts";
import {
  DRAFT_BUDGET_TENTHS,
  buildLegalSquad,
  type SquadBuildMode,
} from "@/lib/fpl/squad";
import {
  getBootstrapStatic,
  getFixtures,
  getManagerEntry,
  getManagerPicks,
} from "@/lib/fpl/client";
import { getRelevantGameweek } from "@/lib/fpl/analysis";
import {
  managerIdSchema,
  squadDraftPicksSchema,
} from "@/lib/fpl/validation";
import { z } from "zod";

const generateBodySchema = z.object({
  mode: z.enum(["draft_100", "wildcard"]),
  managerId: managerIdSchema.optional(),
  gameweek: z.number().int().positive().optional(),
  title: z.string().min(1).max(120).optional(),
  save: z.boolean().optional().default(true),
  force: z.boolean().optional().default(false),
});

const saveBodySchema = z.object({
  action: z.literal("save"),
  draftId: z.string().min(1).optional(),
  title: z.string().min(1).max(120),
  mode: z.enum(["draft_100", "wildcard"]),
  budgetTenths: z.number().int().positive().optional(),
  picks: squadDraftPicksSchema,
  managerId: managerIdSchema.optional().nullable(),
  gameweek: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export async function GET() {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const rows = await listUserDrafts(user.id, 50);
  return Response.json({ drafts: rows.map(serializeDraft) });
}

export async function POST(req: Request) {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (body?.action === "save") {
    const parsed = saveBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid save payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const budgetTenths =
      parsed.data.budgetTenths ??
      (parsed.data.mode === "draft_100" ? DRAFT_BUDGET_TENTHS : 0);
    if (!budgetTenths) {
      return Response.json(
        { error: "budgetTenths is required for wildcard saves." },
        { status: 400 },
      );
    }
    const result = await upsertManualDraft({
      userId: user.id,
      draftId: parsed.data.draftId,
      title: parsed.data.title,
      mode: parsed.data.mode,
      budgetTenths,
      picks: parsed.data.picks,
      managerId: parsed.data.managerId,
      gameweek: parsed.data.gameweek,
      notes: parsed.data.notes,
      status: parsed.data.status,
    });
    if (result.error || !result.row) {
      return Response.json(
        {
          error: result.error ?? "Save failed",
          issues: result.issues,
        },
        { status: result.error === "Draft not found." ? 404 : 422 },
      );
    }
    return Response.json({
      draft: serializeDraft(result.row),
      issues: result.issues,
    });
  }

  const parsed = generateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid generate payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { mode, managerId, gameweek, title, save, force } = parsed.data;
  const [bootstrap, fixtures] = await Promise.all([
    getBootstrapStatic(),
    getFixtures(),
  ]);
  const relevant = getRelevantGameweek(bootstrap);
  let budgetTenths = DRAFT_BUDGET_TENTHS;
  let resolvedManagerId: number | undefined;
  let gw = gameweek ?? relevant.id;

  if (mode === "wildcard") {
    if (!managerId) {
      return Response.json(
        { error: "managerId is required for wildcard mode." },
        { status: 400 },
      );
    }
    resolvedManagerId = managerId;
    const entry = await getManagerEntry(managerId);
    gw = gameweek ?? entry.current_event ?? relevant.id;
    if (!gw) {
      return Response.json(
        { error: "No gameweek available for manager value." },
        { status: 400 },
      );
    }
    const picks = await getManagerPicks(managerId, gw);
    budgetTenths = picks.entry_history.value + picks.entry_history.bank;
  }

  // `force` retained for API compatibility; synthesis is no longer required.
  void force;
  const [beliefs, activeThesis] = await Promise.all([
    getActiveBeliefMap(user.id),
    getActiveThesis(user.id),
  ]);
  const built = buildLegalSquad({
    bootstrap,
    fixtures,
    gameweek: { ...relevant, id: gw || 1 },
    mode: mode as SquadBuildMode,
    budgetTenths,
    beliefs,
  });

  if (!save) {
    return Response.json({
      built: {
        ...built,
        budget: built.budgetTenths / 10,
        cost: built.costTenths / 10,
        bank: built.bankTenths / 10,
      },
    });
  }

  const result = await saveBuiltSquadDraft({
    userId: user.id,
    title:
      title ??
      (mode === "draft_100"
        ? `£100m draft GW${gw || "?"}`
        : `Wildcard draft GW${gw || "?"}`),
    built,
    managerId: resolvedManagerId ?? null,
  });

  if (result.error || !result.row) {
    return Response.json(
      {
        error: result.error ?? "Generated squad is invalid.",
        issues: result.issues,
        built: {
          valid: built.valid,
          issues: built.issues,
          averageScore: built.averageScore,
        },
      },
      { status: 422 },
    );
  }

  if (activeThesis) {
    await markThesisApplied({
      userId: user.id,
      thesisId: activeThesis.id,
      linkedDraftId: result.row.id,
    });
  }

  return Response.json({
    draft: serializeDraft(result.row),
    built: {
      valid: built.valid,
      issues: built.issues,
      averageScore: built.averageScore,
    },
  });
}
