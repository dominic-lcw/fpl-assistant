import { NextResponse } from "next/server";

import { getRelevantGameweek, summarizeManagerSnapshot } from "@/lib/fpl/analysis";
import { FplApiError, getBootstrapStatic, getManagerEntry } from "@/lib/fpl/client";
import { managerIdSchema } from "@/lib/fpl/validation";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = managerIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manager ID. Use a positive integer." },
      { status: 400 },
    );
  }

  try {
    const [entry, bootstrap] = await Promise.all([
      getManagerEntry(parsed.data),
      getBootstrapStatic(),
    ]);
    return NextResponse.json({
      manager: summarizeManagerSnapshot(entry, bootstrap),
      gameweek: getRelevantGameweek(bootstrap),
    });
  } catch (error) {
    if (error instanceof FplApiError) {
      const status = error.status === 404 ? 404 : 502;
      return NextResponse.json(
        {
          error:
            error.status === 404
              ? "Manager not found."
              : "Could not reach Fantasy Premier League right now.",
        },
        { status },
      );
    }
    return NextResponse.json(
      { error: "Unexpected error loading manager." },
      { status: 500 },
    );
  }
}
