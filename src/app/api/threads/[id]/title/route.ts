import { generateText } from "ai";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { threads } from "@/db/schema";
import { getApprovedUser } from "@/lib/access";
import { resolveKimiModelId } from "@/lib/kimi/models";
import { createKimiProvider } from "@/lib/kimi/provider";
import {
  buildTitleTranscript,
  fallbackTitleFromMessages,
  sanitizeTitle,
  TITLE_SYSTEM_PROMPT,
  type TitleMessage,
} from "@/lib/threads/title";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getApprovedUser();
  if (!user) {
    return Response.json({ error: "Approved access is required." }, { status: 403 });
  }

  const { id } = await params;
  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, user.id)))
    .limit(1);
  if (!thread) {
    return Response.json({ error: "Thread not found." }, { status: 404 });
  }

  const body = (await request.json()) as { messages?: unknown };
  const messages = Array.isArray(body.messages)
    ? (body.messages as TitleMessage[])
    : [];

  let title = fallbackTitleFromMessages(messages);

  if (process.env.MOONSHOT_API_KEY) {
    const transcript = buildTitleTranscript(messages);
    if (transcript) {
      try {
        const kimi = createKimiProvider();
        const result = await generateText({
          model: kimi(resolveKimiModelId()),
          system: TITLE_SYSTEM_PROMPT,
          prompt: transcript,
          maxOutputTokens: 40,
        });
        title = sanitizeTitle(result.text) ?? title;
      } catch {
        // Keep fallback title when the model call fails.
      }
    }
  }

  await db
    .update(threads)
    .set({ title, updatedAt: new Date() })
    .where(eq(threads.id, thread.id));

  return Response.json({ title });
}
