import { moonshotai } from "@ai-sdk/moonshotai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { createFplTools } from "@/lib/fpl/tools";
import { managerIdSchema } from "@/lib/fpl/validation";

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
- get_suggestions → deterministic captain/transfer/watchlist from API data

Web tool:
- web_search → injuries, press, lineups, manager/team news, and other off-API FPL context about players, teams, or managers

Rules:
- Always use tools for live FPL facts. Do not invent player stats, fixtures, ranks, or IDs.
- Resolve player names via get_general_information / bootstrap data before calling get_player_detailed_data.
- Use web_search for recent news; then cross-check availability fields from FPL tools before advising.
- If a manager ID is present in context, use it by default for manager/squad/suggestion tools.
- If data is unavailable (preseason, missing picks, API errors), say so clearly.
- Include the relevant gameweek when giving advice.
- Ground recommendations in form, expected goal involvement, minutes, availability, and fixture difficulty.
- Present suggestions as advice, not certainty. Prefer concise, actionable markdown.
- When helpful, list top options with short evidence bullets and cite web sources when used.`;

function extractManagerId(system?: string): number | undefined {
  if (!system) return undefined;
  const match = system.match(/Manager ID:\s*(\d+)/i);
  if (!match?.[1]) return undefined;
  const parsed = managerIdSchema.safeParse(match[1]);
  return parsed.success ? parsed.data : undefined;
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    messages,
    system,
    tools: frontendToolDefs,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, unknown>;
  } = body;

  if (!process.env.MOONSHOT_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "Missing MOONSHOT_API_KEY. Add it to .env.local (see .env.example).",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const modelId = process.env.KIMI_MODEL?.trim() || "kimi-k3";
  const managerId = extractManagerId(system);
  const fplTools = createFplTools(managerId);

  const result = streamText({
    model: moonshotai(modelId),
    system: [SYSTEM_PROMPT, system].filter(Boolean).join("\n\n"),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
    tools: {
      ...frontendTools(frontendToolDefs as never),
      ...fplTools,
    },
  });

  return result.toUIMessageStreamResponse();
}
