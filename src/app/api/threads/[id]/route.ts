import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { threads } from "@/db/schema";
import { getApprovedUser } from "@/lib/access";

type RouteContext = { params: Promise<{ id: string }> };

async function ownedThread(id: string) {
  const user = await getApprovedUser();
  if (!user) return null;

  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, user.id)))
    .limit(1);

  return thread ?? null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const thread = await ownedThread(id);
  if (!thread) return new Response(null, { status: 404 });
  return Response.json(thread);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const thread = await ownedThread(id);
  if (!thread) return new Response(null, { status: 404 });

  const body = (await request.json()) as {
    title?: unknown;
    status?: unknown;
  };
  const values: { title?: string | null; status?: "regular" | "archived"; updatedAt: Date } =
    { updatedAt: new Date() };

  if (typeof body.title === "string") {
    values.title = body.title.trim().slice(0, 200) || null;
  }
  if (body.status === "regular" || body.status === "archived") {
    values.status = body.status;
  }
  if (Object.keys(values).length === 1) {
    return Response.json({ error: "No valid thread updates." }, { status: 400 });
  }

  await db.update(threads).set(values).where(eq(threads.id, thread.id));
  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const thread = await ownedThread(id);
  if (!thread) return new Response(null, { status: 404 });

  await db.delete(threads).where(eq(threads.id, thread.id));
  return new Response(null, { status: 204 });
}
