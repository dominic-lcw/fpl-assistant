import { describe, expect, it } from "vitest";

import { buildFollowUpsFromMessages } from "./follow-up-suggestions";
import type { ThreadMessage } from "@assistant-ui/react";

function assistantWithTools(
  tools: Array<{ toolName: string; result?: unknown }>,
): ThreadMessage {
  return {
    id: "a1",
    createdAt: new Date(),
    role: "assistant",
    content: tools.map((tool, index) => ({
      type: "tool-call" as const,
      toolCallId: `tc-${index}`,
      toolName: tool.toolName,
      args: {},
      argsText: "{}",
      result: tool.result,
    })),
    status: { type: "complete", reason: "stop" },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  } as ThreadMessage;
}

describe("buildFollowUpsFromMessages", () => {
  it("suggests captain comparison after get_suggestions", () => {
    const followUps = buildFollowUpsFromMessages([
      assistantWithTools([
        {
          toolName: "get_suggestions",
          result: {
            captainCandidates: [{ name: "Haaland" }, { name: "Salah" }],
            transferOutCandidates: [{ name: "Jackson" }],
            transferInCandidates: [{ name: "Watkins" }],
            researchTargets: ["Haaland (MCI) — status d"],
          },
        },
      ]),
    ]);

    expect(followUps.some((f) => /Haaland vs Salah/i.test(f.prompt))).toBe(true);
    expect(followUps.some((f) => /Watkins/i.test(f.prompt))).toBe(true);
    expect(followUps.some((f) => /availability risks/i.test(f.prompt))).toBe(
      true,
    );
  });

  it("falls back to clarifying prompts when no tools ran", () => {
    const followUps = buildFollowUpsFromMessages([
      {
        id: "a1",
        createdAt: new Date(),
        role: "assistant",
        content: [{ type: "text", text: "Happy to help." }],
        status: { type: "complete", reason: "stop" },
        metadata: {
          unstable_state: null,
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          custom: {},
        },
      } as ThreadMessage,
    ]);
    expect(followUps[0]?.prompt).toMatch(/clarifying questions/i);
  });

  it("keeps Reddit discussion separate from belief changes", () => {
    const followUps = buildFollowUpsFromMessages([
      assistantWithTools([{ toolName: "list_reddit_fpl_threads" }]),
    ]);

    expect(followUps.some((f) => /without changing my beliefs/i.test(f.prompt))).toBe(
      true,
    );
  });

  it("nudges squad build from beliefs without requiring synthesis", () => {
    const followUps = buildFollowUpsFromMessages([
      assistantWithTools([{ toolName: "upsert_player_belief" }]),
    ]);

    expect(followUps.some((f) => /squad from these beliefs/i.test(f.prompt))).toBe(
      true,
    );
    expect(followUps.some((f) => /synthesize/i.test(f.prompt))).toBe(false);
  });
});
