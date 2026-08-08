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
- analyze_fpl_data → arbitrary DuckDB SQL over the latest players, teams, fixtures, and the user's active beliefs; use for rankings/calculations that existing tools do not cover
- get_suggestions → deterministic captain/transfer/watchlist + comparison rows (uses active thesis beliefs)
- compare_players → side-by-side form/xGI/fixtures/ownership for 2–4 players (uses active thesis beliefs)
- suggest_squad → build a legal 15-player squad after thesis synthesis; modes draft_100 or wildcard; set save=true to persist
- list_squad_drafts / get_squad_draft / delete_squad_draft → manage saved squad drafts

Form thesis tools (private per user — never shared):
- create_form_thesis → start a named thesis that will hold player beliefs
- compute_player_expectation → quantify expected points from FPL baseline + belief priors (before inventing numbers)
- upsert_player_belief / list_player_beliefs / get_player_belief / clear_player_belief → manage beliefs inside a thesis (upsert auto-stores expectedPoints)
- get_form_thesis / list_form_theses / synthesize_form_thesis / archive_form_thesis → load, synthesize, or archive theses

Interactive / web tools:
- ask_user_choices → pause and ask a multiple-choice clarifying question in the UI. Wait for the user's tap.
- $web_search → injuries, press, lineups, and other off-API FPL context

Squad rules (always enforce via suggest_squad, never invent illegal squads):
- Exactly 15 players: 2 GKP, 5 DEF, 5 MID, 3 FWD
- Max 3 players from any one Premier League club
- draft_100 budget £100.0m; wildcard budget = manager squad value + bank

Form thesis workflow (explicit — do this for squad construction):
1. create_form_thesis with a clear title (e.g. "GW4 template + Haaland ceiling").
2. Gather evidence (FPL tools + $web_search). Call compute_player_expectation to quantify xPts, then upsert_player_belief for each contested player. Beliefs are the thesis content.
3. Optionally ask_user_choices for risk / differential preference.
4. synthesize_form_thesis with a summary of the beliefs and how the squad should be built. Do not skip this before the final team.
5. suggest_squad (save=true when the user wants it kept). If the thesis is still collecting, synthesize first (force=true only if the user insists).

Belief rules:
- formBelief is a capped delta (−2…+2) vs API form; confidence scales the effect; minutesRisk penalises rotation/injury doubt.
- expectedPoints is calculated (not invented): baseline EP × belief adjustments over horizonGw. Prefer compute_player_expectation; upsert also auto-fills expectedPoints plus ceiling/floor bands.
- Never invent beliefs without tool evidence. Clear beliefs when status flips or the prior no longer holds.
- Present beliefs as priors that adjust scores, not as facts. The UI shows each belief as a card with quantified xPts.

Advice workflow (captain/transfers):
1. Clarify unknowns with ask_user_choices when preference would change the pick.
2. Pull official numbers with FPL tools. Never invent stats, prices, ranks, or IDs.
3. For a novel ranking or calculation, use analyze_fpl_data rather than guessing. It supports normal DuckDB SQL (CTEs, joins, windows, aggregates) over a fresh snapshot. Inspect the tables returned by the tool; never assume a column exists.
4. If form/news diverges from the API, upsert beliefs on the active thesis, then re-run suggestions/comparisons.
5. If researchTargets is non-empty, call $web_search, then re-check API availability.
6. Present a short comparison of the top 2–3 options with evidence. Explain why #1 beats #2.
7. Give a clear recommendation framed as advice, not certainty. Include the relevant gameweek.

Rules:
- Resolve player names via get_general_information / bootstrap data before get_player_detailed_data or compare_players.
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
