import { getApprovedUser } from "@/lib/access";
import { clearUserPlayerBelief } from "@/lib/fpl/beliefs";
import { getActiveThesis, getUserThesis } from "@/lib/fpl/theses";
import { z } from "zod";

const deleteQuerySchema = z.object({
  elementId: z.coerce.number().int().positive(),
  thesisId: z.string().min(1).optional(),
});

export async function DELETE(req: Request) {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const parsed = deleteQuerySchema.safeParse({
    elementId: url.searchParams.get("elementId"),
    thesisId: url.searchParams.get("thesisId") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const thesis = parsed.data.thesisId
    ? await getUserThesis(user.id, parsed.data.thesisId)
    : await getActiveThesis(user.id);
  if (!thesis) {
    return Response.json({ error: "Thesis not found." }, { status: 404 });
  }

  const deleted = await clearUserPlayerBelief(
    user.id,
    thesis.id,
    parsed.data.elementId,
  );
  if (!deleted) {
    return Response.json({ error: "Belief not found." }, { status: 404 });
  }

  return Response.json({
    deleted: deleted.elementId,
    thesisId: deleted.thesisId,
  });
}
