import { getApprovedUser } from "@/lib/access";
import {
  getActiveThesis,
  getThesisWithBeliefs,
  listUserTheses,
  serializeThesis,
} from "@/lib/fpl/theses";
import { getBootstrapStatic } from "@/lib/fpl/client";

export async function GET(req: Request) {
  const user = await getApprovedUser();
  if (!user) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const thesisId = url.searchParams.get("id");
  const activeOnly = url.searchParams.get("active") === "1";

  if (thesisId || activeOnly) {
    const id = thesisId ?? (await getActiveThesis(user.id))?.id;
    if (!id) {
      return Response.json({ thesis: null, beliefs: [] });
    }
    const packed = await getThesisWithBeliefs(user.id, id);
    if (!packed) {
      return Response.json({ error: "Thesis not found." }, { status: 404 });
    }
    const bootstrap = await getBootstrapStatic();
    const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
    const beliefs = (packed.thesis.beliefs ?? []).map((belief) => {
      const element = byId.get(belief.elementId);
      return {
        ...belief,
        name: element?.web_name ?? String(belief.elementId),
        team: element
          ? bootstrap.teams.find((t) => t.id === element.team)?.short_name
          : undefined,
        position: element
          ? bootstrap.element_types.find((t) => t.id === element.element_type)
              ?.singular_name_short
          : undefined,
      };
    });
    return Response.json({
      thesis: { ...packed.thesis, beliefs, beliefCount: beliefs.length },
    });
  }

  const rows = await listUserTheses(user.id, 30);
  return Response.json({
    theses: rows.map((row) => serializeThesis(row)),
  });
}
