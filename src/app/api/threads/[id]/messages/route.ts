import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, threads } from "@/db/schema";
import { getApprovedUser } from "@/lib/access";

type RouteContext = { params: Promise<{ id: string }> };

async function hasThreadAccess(id: string) {
  const user = await getApprovedUser();
  if (!user) return false;

  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, user.id)))
    .limit(1);
  return Boolean(thread);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!(await hasThreadAccess(id))) {
    return new Response(null, { status: 404 });
  }

  const rows = await db
    .select({
      id: messages.id,
      parent_id: messages.parentId,
      format: messages.format,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.threadId, id))
    .orderBy(asc(messages.createdAt));

  return Response.json(rows);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id: threadId } = await params;
  if (!(await hasThreadAccess(threadId))) {
    return new Response(null, { status: 404 });
  }

  const body = (await request.json()) as {
    id?: unknown;
    parent_id?: unknown;
    format?: unknown;
    content?: unknown;
  };
  if (
    typeof body.id !== "string" ||
    typeof body.format !== "string" ||
    !body.content ||
    typeof body.content !== "object" ||
    (body.parent_id !== null && typeof body.parent_id !== "string")
  ) {
    return Response.json({ error: "Invalid message payload." }, { status: 400 });
  }

  await db
    .insert(messages)
    .values({
      id: body.id,
      threadId,
      parentId: body.parent_id ?? null,
      format: body.format,
      content: body.content as Record<string, unknown>,
    })
    .onConflictDoNothing();
  await db
    .update(threads)
    .set({ updatedAt: new Date() })
    .where(eq(threads.id, threadId));

  return new Response(null, { status: 204 });
}
