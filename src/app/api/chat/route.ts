import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { threads } from "@/db/schema";
import { createFplTools } from "@/lib/fpl/tools";
import { getApprovedUser } from "@/lib/access";
import { managerIdSchema } from "@/lib/fpl/validation";
import { createKimiBuiltinWebSearchTool } from "@/lib/kimi/builtin-web-search";
import { resolveKimiModelId } from "@/lib/kimi/models";
import { createKimiProvider } from "@/lib/kimi/provider";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are FPL Assistant, an expert Fantasy Premier League advisor.

FPL API tools (prefer these for official numbers):
- get_general_information → /bootstrap-static/ (gameweeks, teams, player index)
- get_fixtures → /fixtures/ (optional gameweek filter)
- get_gameweek_live → /event/{gw}/live/
- get_manager_basic_info → /entry/{id}/
- get_manager_history → /entry/{id}/history/
- get_manager_squad → /entry/{id}/event/{gw}/picks/
- get_classic_league_standings → /leagues-classic/{id}/standings/
- get_player_detailed_data → /element-summary/{id}/
- get_suggestions → deterministic captain/transfer/watchlist + comparison rows from API data
- compare_players → side-by-side form/xGI/fixtures/ownership for 2–4 players
- suggest_squad → build a legal 15-player squad (draft_100 £100.0m or wildcard from manager value+bank); set save=true to persist in Postgres
- list_squad_drafts / get_squad_draft / delete_squad_draft → manage the user's saved squad drafts in Postgres

Interactive / web tools:
- ask_user_choices → pause and ask a multiple-choice clarifying question in the UI (risk, budget, template vs differential, chip timing). Wait for the user's tap.
- $web_search → Kimi built-in web search for injuries, press, lineups, manager/team news, and other off-API FPL context

Squad rules (always enforce via suggest_squad, never invent illegal squads):
- Exactly 15 players: 2 GKP, 5 DEF, 5 MID, 3 FWD
- Max 3 players from any one Premier League club
- draft_100 budget £100.0m; wildcard budget = manager squad value + bank
- Prefer suggest_squad(save=true) when the user wants a draft kept for later

Advice workflow (do this, in order, when recommending captain/transfers/squads):
1. Clarify unknowns with ask_user_choices when preference would change the pick (risk appetite, free-hit/wildcard intent, template vs differential, budget flexibility). One focused question is enough; allowSkip when defaults are fine.
2. Pull official numbers with FPL tools (get_suggestions and/or compare_players, plus squad/player detail as needed). Never invent stats, prices, ranks, or IDs.
3. If get_suggestions/compare_players returns researchTargets, or a player is doubtful/injured/rotated, call $web_search, then re-check API availability fields before locking advice.
4. Present a short comparison of the top 2–3 options with evidence (form, xGI, ownership, fixtures, news). Explain why #1 beats #2 — do not dump opaque scores alone.
5. Give a clear recommendation framed as advice, not certainty. Include the relevant gameweek.

Rules:
- Resolve player names via get_general_information / bootstrap data before calling get_player_detailed_data or compare_players.
- If a manager ID is present in context, use it by default for manager/squad/suggestion/wildcard tools.
- If data is unavailable (preseason, missing picks, API errors), say so clearly.
- Prefer concise, actionable markdown. Cite web sources when $web_search was used.`;

function extractManagerId(system?: string): number | undefined {
  if (!system) return undefined;
  const match = system.match(/Manager ID:\s*(\d+)/i);
  if (!match?.[1]) return undefined;
  const parsed = managerIdSchema.safeParse(match[1]);
  return parsed.success ? parsed.data : undefined;
}

export async function POST(req: Request) {
  const user = await getApprovedUser();
  if (!user) {
    return Response.json({ error: "Approved access is required." }, { status: 403 });
  }

  const body = await req.json();
  const {
    messages,
    system,
    tools: frontendToolDefs,
    model,
    id: threadId,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, unknown>;
    model?: string;
    id?: string;
  } = body;

  if (threadId) {
    const [thread] = await db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.id, threadId), eq(threads.userId, user.id)))
      .limit(1);
    if (!thread) {
      return Response.json({ error: "Thread not found." }, { status: 404 });
    }
  }

  if (!process.env.MOONSHOT_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "Missing MOONSHOT_API_KEY. Add it to .env.local (see .env.example).",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const modelId = resolveKimiModelId(model);
  const managerId = extractManagerId(system);
  const fplTools = createFplTools({ managerId, userId: user.id });
  const kimi = createKimiProvider();

  const result = streamText({
    model: kimi(modelId),
    system: [SYSTEM_PROMPT, system].filter(Boolean).join("\n\n"),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(12),
    tools: {
      ...frontendTools(frontendToolDefs as never),
      ...fplTools,
      ...createKimiBuiltinWebSearchTool(),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { usage: part.totalUsage };
        }
        if (part.type === "finish-step") {
          return { modelId: part.response.modelId };
        }
        return undefined;
      },
    }),
  });
}
