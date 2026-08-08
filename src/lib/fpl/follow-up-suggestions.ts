import type {
  SuggestionAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";

function isToolCall(
  part: ThreadAssistantMessagePart,
): part is Extract<ThreadAssistantMessagePart, { type: "tool-call" }> {
  return part.type === "tool-call";
}

function toolCalls(message: ThreadMessage | undefined) {
  if (!message || message.role !== "assistant") return [];
  return message.content.filter(isToolCall);
}

function playerNamesFromResult(result: unknown, key: string): string[] {
  if (!result || typeof result !== "object") return [];
  const value = (result as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const name = (row as Record<string, unknown>).name;
      return typeof name === "string" ? name : null;
    })
    .filter((name): name is string => Boolean(name));
}

function uniquePrompts(prompts: string[], limit = 4): Array<{ prompt: string }> {
  const seen = new Set<string>();
  const out: Array<{ prompt: string }> = [];
  for (const prompt of prompts) {
    const key = prompt.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ prompt });
    if (out.length >= limit) break;
  }
  return out;
}

/** Deterministic follow-ups from the latest assistant tool results. */
export function buildFollowUpsFromMessages(
  messages: readonly ThreadMessage[],
): Array<{ prompt: string }> {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const calls = toolCalls(lastAssistant);
  const prompts: string[] = [];

  for (const call of calls) {
    if (call.toolName === "ask_user_choices") {
      continue;
    }

    if (call.toolName === "get_suggestions") {
      const captains = playerNamesFromResult(call.result, "captainCandidates");
      const outs = playerNamesFromResult(call.result, "transferOutCandidates");
      const ins = playerNamesFromResult(call.result, "transferInCandidates");

      if (captains.length >= 2) {
        prompts.push(
          `Compare ${captains[0]} vs ${captains[1]} for captain with fixtures, xGI, and any injury news`,
        );
      } else if (captains[0]) {
        prompts.push(
          `Double-check ${captains[0]} captaincy with $web_search for lineup/injury news`,
        );
      }

      if (outs[0] && ins[0]) {
        prompts.push(
          `Is ${ins[0]} a better transfer than keeping ${outs[0]}? Show the data side-by-side`,
        );
      }

      const research = (call.result as { researchTargets?: unknown } | undefined)
        ?.researchTargets;
      if (Array.isArray(research) && research.length > 0) {
        prompts.push(
          "Search the web for the flagged availability risks, then update your advice",
        );
      }

      prompts.push("Ask me 2 clarifying questions before finalising transfers");
    }

    if (
      call.toolName === "upsert_player_belief" ||
      call.toolName === "list_player_beliefs" ||
      call.toolName === "compute_player_expectation"
    ) {
      prompts.push("Build a £100m squad from these beliefs and save it");
      prompts.push("Add another belief for a contested midfielder or forward");
    }

    if (call.toolName === "create_form_thesis" || call.toolName === "get_form_thesis") {
      prompts.push(
        "Compute expected points for 3 contested players, then upsert beliefs",
      );
      prompts.push("Ask me about risk appetite before building a squad");
    }

    if (call.toolName === "synthesize_form_thesis") {
      prompts.push("Build a £100m squad from these beliefs and save it");
      prompts.push("Show captain and transfer suggestions using these beliefs");
    }

    if (call.toolName === "suggest_squad" || call.toolName === "get_squad_draft") {
      prompts.push("Which picks look risky — check news and minutes?");
      prompts.push("Compare two expensive midfielders and propose a swap");
      prompts.push("Ask whether I want template, differential, or balanced");
    }

    if (call.toolName === "compare_players") {
      prompts.push("Which of these should I start or captain this gameweek?");
      prompts.push("Any injury or lineup news that changes this comparison?");
    }

    if (call.toolName === "$web_search" || call.toolName === "web_search") {
      prompts.push("Cross-check those news findings against FPL availability fields");
      prompts.push("Update captain/transfer advice with this news");
    }

    if (call.toolName === "list_reddit_fpl_threads") {
      prompts.push(
        "Summarize the recurring claims and disagreements, without changing my beliefs",
      );
      prompts.push(
        "Compare one Reddit claim with official FPL data and injury news",
      );
    }
  }

  if (prompts.length === 0) {
    prompts.push(
      "Ask me clarifying questions about risk, budget, and differentials",
      "Who should I captain? Compare top options with data and news",
      "Suggest transfers and show a side-by-side comparison",
    );
  }

  return uniquePrompts(prompts);
}

export function createFplFollowUpSuggestionAdapter(): SuggestionAdapter {
  return {
    async generate({ messages }) {
      return buildFollowUpsFromMessages(messages);
    },
  };
}
