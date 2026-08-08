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
import { createCommunityTools } from "@/lib/community/tools";
import { createFplTools } from "@/lib/fpl/tools";
import { getApprovedUser } from "@/lib/access";
import { managerIdSchema } from "@/lib/fpl/validation";
import {
  resolveAzureDeploymentName,
  resolveLlmModelId,
} from "@/lib/llm/models";
import { createAzureProvider, isAzureConfigured } from "@/lib/llm/provider";
import { createAzureWebSearchTool } from "@/lib/llm/web-search";

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
- get_suggestions → deterministic captain/transfer/watchlist + comparison rows (uses active beliefs)
- compare_players → side-by-side form/xGI/fixtures/ownership for 2–4 players (uses active beliefs)
- suggest_squad → build a legal 15-player squad from active beliefs; modes draft_100 or wildcard; set save=true to persist
- list_squad_drafts / get_squad_draft / delete_squad_draft → manage saved squad drafts

Belief tools (private per user — never shared; beliefs are primary):
- compute_player_expectation → quantify expected points from FPL baseline + belief priors (before inventing numbers)
- upsert_player_belief / list_player_beliefs / get_player_belief / clear_player_belief → manage beliefs (upsert auto-stores expectedPoints; a default belief bag is created if needed)
- create_form_thesis / get_form_thesis / list_form_theses / archive_form_thesis / synthesize_form_thesis → legacy belief-group helpers only. Do not use unless the user explicitly asks to name or annotate a group.

Interactive / web tools:
- ask_user_choices → pause and ask a multiple-choice clarifying question in the UI. Wait for the user's tap.
- web_search → injuries, press, lineups, and other off-API FPL context (Azure Foundry Bing grounding)
- list_reddit_fpl_threads → recent posts from user-selected FPL subreddits; community evidence only

Squad rules (always enforce via suggest_squad, never invent illegal squads):
- Exactly 15 players: 2 GKP, 5 DEF, 5 MID, 3 FWD
- Max 3 players from any one Premier League club
- draft_100 budget £100.0m; wildcard budget = manager squad value + bank

Belief workflow (explicit — do this for squad construction):
1. Gather evidence (FPL tools + web_search). Call compute_player_expectation to quantify xPts, then upsert_player_belief for each contested player.
2. Optionally ask_user_choices for risk / differential preference.
3. suggest_squad (save=true when the user wants it kept).
4. Never invent a planning "thesis" for the user. Speak only in player beliefs and squad drafts. If context shows zero beliefs, say so — do not narrate leftover group titles or summaries.

Belief rules:
- formBelief is a capped delta (−2…+2) vs API form; confidence scales the effect; minutesRisk penalises rotation/injury doubt.
- expectedPoints is calculated (not invented): baseline EP × belief adjustments over horizonGw. Prefer compute_player_expectation; upsert also auto-fills expectedPoints plus ceiling/floor bands.
- Never invent beliefs without tool evidence. Clear beliefs when status flips or the prior no longer holds.
- Present beliefs as priors that adjust scores, not as facts. The UI shows each belief as a card with quantified xPts.
- Do not mention "thesis", "form thesis", or "synthesizing a thesis" in user-facing replies.
- Reddit posts are unverified community discussion, not a recommendation input. When asked for community content, call list_reddit_fpl_threads using the subreddits the user named (ask if unknown), then distinguish observations, disagreement, and uncertainty.
- Do not create or update a player belief merely because Reddit discussion was listed or summarized. First present the community evidence and wait for the user to explicitly ask to promote a specific player observation into a belief.
- If the user explicitly promotes community evidence into a belief, use its direct Reddit URLs in sources, set confidence no higher than 0.35 and horizonGw to 1 unless independent official evidence supports a higher value, and say it is community-derived.

Advice workflow (captain/transfers):
1. Clarify unknowns with ask_user_choices when preference would change the pick.
2. Pull official numbers with FPL tools. Never invent stats, prices, ranks, or IDs.
3. For a novel ranking or calculation, use analyze_fpl_data rather than guessing. It supports normal DuckDB SQL (CTEs, joins, windows, aggregates) over a fresh snapshot. Inspect the tables returned by the tool; never assume a column exists.
4. If form/news diverges from the API, upsert beliefs, then re-run suggestions/comparisons.
5. If researchTargets is non-empty, call web_search, then re-check API availability.
6. Present a short comparison of the top 2–3 options with evidence. Explain why #1 beats #2.
7. Give a clear recommendation framed as advice, not certainty. Include the relevant gameweek.

Rules:
- Resolve player names via get_general_information / bootstrap data before get_player_detailed_data or compare_players.
- If a manager ID is present in context, use it by default for manager/squad/suggestion/wildcard tools.
- If data is unavailable (preseason, missing picks, API errors), say so clearly.
- Prefer concise, actionable markdown. Cite web sources when web_search was used.`;

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

  if (!isAzureConfigured()) {
    return new Response(
      JSON.stringify({
        error:
          "Missing Azure Foundry credentials. Set AZURE_API_KEY and AZURE_RESOURCE_NAME (or AZURE_BASE_URL). See .env.example.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const modelId = resolveLlmModelId(model);
  const deploymentName = resolveAzureDeploymentName(modelId);
  const managerId = extractManagerId(system);
  const fplTools = createFplTools({ managerId, userId: user.id });
  const azure = createAzureProvider();

  const result = streamText({
    model: azure(deploymentName),
    system: [SYSTEM_PROMPT, system].filter(Boolean).join("\n\n"),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(12),
    tools: {
      ...frontendTools(frontendToolDefs as never),
      ...fplTools,
      ...createCommunityTools(),
      ...createAzureWebSearchTool(azure),
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
