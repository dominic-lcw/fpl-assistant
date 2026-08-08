import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { threads } from "@/db/schema";
import { getApprovedUser } from "@/lib/access";
import { getThreadArchiveCutoff } from "@/lib/threads/retention";

export async function GET() {
  const user = await getApprovedUser();
  if (!user) return new Response(null, { status: 403 });

  // Archive inactive threads when the owner next loads their conversation list.
  // This avoids requiring a separate scheduled worker while keeping archived
  // conversations available for restoration.
  await db
    .update(threads)
    .set({ status: "archived" })
    .where(
      and(
        eq(threads.userId, user.id),
        eq(threads.status, "regular"),
        lt(threads.updatedAt, getThreadArchiveCutoff()),
      ),
    );

  const rows = await db
    .select({
      id: threads.id,
      title: threads.title,
      status: threads.status,
      createdAt: threads.createdAt,
      updatedAt: threads.updatedAt,
    })
    .from(threads)
    .where(eq(threads.userId, user.id))
    .orderBy(desc(threads.updatedAt));

  return Response.json(rows);
}

export async function POST() {
  const user = await getApprovedUser();
  if (!user) return new Response(null, { status: 403 });

  const id = crypto.randomUUID();
  await db.insert(threads).values({ id, userId: user.id });
  return Response.json({ id });
}
