import { moonshotai } from "@ai-sdk/moonshotai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { resolveKimiModelId } from "@/lib/kimi/models";
import { createFplTools } from "@/lib/fpl/tools";
import { managerIdSchema } from "@/lib/fpl/validation";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are FPL Assistant, an expert Fantasy Premier League advisor.

Rules:
- Always use tools for live FPL facts. Do not invent player stats, fixtures, ranks, or IDs.
- If a manager ID is present in context, use it by default for manager/squad/suggestion tools.
- If data is unavailable (preseason, missing picks, API errors), say so clearly.
- Include the relevant gameweek when giving advice.
- Ground recommendations in form, expected goal involvement, minutes, availability, and fixture difficulty.
- Present suggestions as advice, not certainty. Prefer concise, actionable markdown.
- When helpful, list top options with short evidence bullets.`;

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
    model,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, unknown>;
    model?: string;
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

  const modelId = resolveKimiModelId(model);
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
