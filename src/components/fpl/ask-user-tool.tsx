"use client";

import { useState } from "react";
import {
  makeAssistantTool,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const askUserChoicesSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe("Clear clarifying question for the user"),
  choices: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(2)
    .max(6)
    .describe("2–6 mutually exclusive answers the user can tap"),
  allowSkip: z
    .boolean()
    .optional()
    .describe("If true, show a skip option that means no preference"),
  context: z
    .string()
    .optional()
    .describe("Short note on why this changes the advice"),
});

type AskUserChoicesArgs = z.infer<typeof askUserChoicesSchema>;

type AskUserChoicesResult = {
  selectedId: string;
  selectedLabel: string;
  skipped?: boolean;
};

function AskUserChoicesRender({
  args,
  result,
  status,
  addResult,
}: ToolCallMessagePartProps<AskUserChoicesArgs, AskUserChoicesResult>) {
  const [submittedId, setSubmittedId] = useState<string | null>(
    result?.selectedId ?? null,
  );

  const choices = args?.choices ?? [];
  const isComplete = Boolean(result) || status?.type === "complete";
  const canAnswer =
    !isComplete &&
    (status?.type === "requires-action" || status?.type === "running");

  const submit = (choice: {
    id: string;
    label: string;
    skipped?: boolean;
  }) => {
    if (!canAnswer || submittedId) return;
    setSubmittedId(choice.id);
    addResult({
      selectedId: choice.id,
      selectedLabel: choice.label,
      skipped: choice.skipped,
    });
  };

  return (
    <div className="border-border/70 bg-muted/20 my-2 w-full max-w-xl rounded-xl border px-3 py-3">
      <p className="text-foreground text-sm font-medium leading-snug">
        {args?.question ?? "Quick preference check"}
      </p>
      {args?.context ? (
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {args.context}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {choices.map((choice) => {
          const selected =
            submittedId === choice.id || result?.selectedId === choice.id;
          return (
            <Button
              key={choice.id}
              type="button"
              variant={selected ? "default" : "outline"}
              disabled={!canAnswer && !selected}
              className={cn(
                "h-auto justify-start whitespace-normal px-3 py-2 text-left",
                selected && "ring-ring ring-1",
              )}
              onClick={() => submit(choice)}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{choice.label}</span>
                {choice.description ? (
                  <span className="text-muted-foreground text-xs font-normal">
                    {choice.description}
                  </span>
                ) : null}
              </span>
            </Button>
          );
        })}
        {args?.allowSkip ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={!canAnswer}
            onClick={() =>
              submit({
                id: "skip",
                label: "No preference — use balanced defaults",
                skipped: true,
              })
            }
          >
            No preference
          </Button>
        ) : null}
      </div>
      {result ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Noted: {result.selectedLabel}
        </p>
      ) : null}
    </div>
  );
}

/** Human-in-the-loop clarifying questions rendered as tap-to-answer chips. */
export const AskUserChoicesTool = makeAssistantTool({
  toolName: "ask_user_choices",
  type: "human",
  description:
    "Ask the user a clarifying multiple-choice question before giving FPL advice. Use when risk appetite, budget flexibility, template vs differential preference, chip timing, or captaincy style is unknown. Do not invent answers — wait for the UI result.",
  parameters: askUserChoicesSchema,
  render: AskUserChoicesRender,
});
