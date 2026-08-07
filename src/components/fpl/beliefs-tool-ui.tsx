"use client";

import { useEffect } from "react";
import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import {
  normalizeBelief,
  useThesisContext,
  type ThesisBeliefView,
} from "@/components/fpl/thesis-context";
import { cn } from "@/lib/utils";

function signed(value: number, digits = 1) {
  const abs = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${abs}` : value < 0 ? `−${abs}` : abs;
}

export function BeliefCard({
  belief,
  compact = false,
}: {
  belief: ThesisBeliefView;
  compact?: boolean;
}) {
  const deltaPositive = belief.beliefDelta >= 0;
  return (
    <article
      className={cn(
        "border-border/60 bg-background/80 rounded-lg border px-3 py-2",
        compact && "px-2 py-1.5",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {belief.name ?? `#${belief.elementId}`}
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
              {[belief.team, belief.position].filter(Boolean).join(" · ")}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          {belief.expectedPoints != null ? (
            <p className="tabular-nums text-sm font-semibold">
              {belief.expectedPoints.toFixed(1)}
              <span className="text-muted-foreground ml-1 text-[0.65rem] font-normal">
                xPts/{belief.horizonGw}gw
              </span>
            </p>
          ) : null}
          <p
            className={cn(
              "tabular-nums text-xs font-semibold",
              deltaPositive
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300",
            )}
          >
            Δ {signed(belief.beliefDelta)}
          </p>
        </div>
      </div>
      <dl className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem] tabular-nums">
        <div>
          <dt className="inline">form </dt>
          <dd className="text-foreground inline font-medium">
            {signed(belief.formBelief)}
          </dd>
        </div>
        <div>
          <dt className="inline">mins risk </dt>
          <dd className="text-foreground inline font-medium">
            {(belief.minutesRisk * 100).toFixed(0)}%
          </dd>
        </div>
        <div>
          <dt className="inline">conf </dt>
          <dd className="text-foreground inline font-medium">
            {(belief.confidence * 100).toFixed(0)}%
          </dd>
        </div>
        {belief.floor != null && belief.ceiling != null ? (
          <div>
            <dt className="inline">band </dt>
            <dd className="text-foreground inline font-medium">
              {belief.floor.toFixed(1)}–{belief.ceiling.toFixed(1)}
            </dd>
          </div>
        ) : null}
      </dl>
      {!compact && belief.rationale ? (
        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
          {belief.rationale}
        </p>
      ) : null}
      {!compact && belief.sources.length > 0 ? (
        <p className="text-muted-foreground/80 mt-1 text-[0.65rem]">
          Sources: {belief.sources.join(" · ")}
        </p>
      ) : null}
    </article>
  );
}

function BeliefList({ beliefs }: { beliefs: ThesisBeliefView[] }) {
  if (beliefs.length === 0) {
    return (
      <p className="text-muted-foreground text-xs italic">No beliefs yet.</p>
    );
  }
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {beliefs.map((belief) => (
        <li key={belief.id || `${belief.thesisId}-${belief.elementId}`}>
          <BeliefCard belief={belief} />
        </li>
      ))}
    </ul>
  );
}

type BeliefToolResult = {
  error?: string;
  thesis?: Record<string, unknown>;
  belief?: Record<string, unknown>;
  beliefs?: Array<Record<string, unknown>>;
  note?: string;
  player?: { name?: string };
};

function useSyncThesisResult(result: unknown, statusType?: string) {
  const { applyThesisToolResult, mergeBeliefIntoActive } = useThesisContext();
  useEffect(() => {
    if (statusType !== "complete" || !result || typeof result !== "object") {
      return;
    }
    const root = result as BeliefToolResult;
    if (root.error) return;
    applyThesisToolResult(result);
    if (root.belief && typeof root.belief === "object") {
      mergeBeliefIntoActive(normalizeBelief(root.belief));
    }
  }, [applyThesisToolResult, mergeBeliefIntoActive, result, statusType]);
}

function UpsertBeliefRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, BeliefToolResult>,
) {
  const { result, status } = props;
  useSyncThesisResult(result, status?.type);
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const belief = result.belief
    ? normalizeBelief(result.belief)
    : null;
  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <p className="text-sm font-medium">Belief updated</p>
      {typeof result.thesis?.title === "string" ? (
        <p className="text-muted-foreground mt-0.5 text-xs">
          Thesis: {result.thesis.title}
        </p>
      ) : null}
      {belief ? (
        <div className="mt-2">
          <BeliefCard belief={belief} />
        </div>
      ) : null}
      {result.note ? (
        <p className="text-muted-foreground mt-2 text-[0.7rem]">{result.note}</p>
      ) : null}
    </div>
  );
}

function ListBeliefsRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, BeliefToolResult>,
) {
  const { result, status } = props;
  useSyncThesisResult(result, status?.type);
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const beliefs = (result.beliefs ?? []).map(normalizeBelief);
  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Form beliefs</p>
        <p className="text-muted-foreground text-xs">
          {typeof result.thesis?.title === "string"
            ? String(result.thesis.title)
            : "Active thesis"}
          {" · "}
          {beliefs.length} player{beliefs.length === 1 ? "" : "s"}
        </p>
      </div>
      <BeliefList beliefs={beliefs} />
    </div>
  );
}

function GetBeliefRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, BeliefToolResult>,
) {
  const { result, status } = props;
  useSyncThesisResult(result, status?.type);
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  if (!result.belief) {
    return (
      <div className="border-border/70 text-muted-foreground my-2 rounded-xl border px-3 py-3 text-xs">
        {result.note ?? "No belief for this player."}
      </div>
    );
  }
  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <p className="text-sm font-medium">Player belief</p>
      <div className="mt-2">
        <BeliefCard belief={normalizeBelief(result.belief)} />
      </div>
    </div>
  );
}

function ClearBeliefRender(
  props: ToolCallMessagePartProps<
    Record<string, unknown>,
    { error?: string; deleted?: number; thesisId?: string }
  >,
) {
  const { result, status } = props;
  const { refreshActiveThesis } = useThesisContext();
  useEffect(() => {
    if (status?.type === "complete" && result && !result.error) {
      void refreshActiveThesis();
    }
  }, [refreshActiveThesis, result, status?.type]);

  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  return (
    <div className="border-border/70 text-muted-foreground my-2 rounded-xl border px-3 py-2 text-xs">
      Cleared belief for player #{result.deleted}.
    </div>
  );
}

type ExpectationToolResult = {
  error?: string;
  player?: {
    name?: string;
    team?: string;
    position?: string;
    form?: number;
    epNext?: number;
  };
  expectation?: {
    baselinePerGw?: number;
    adjustedPerGw?: number;
    expectedPoints?: number;
    suggestedCeiling?: number;
    suggestedFloor?: number;
    horizonGw?: number;
    formBelief?: number;
    minutesRisk?: number;
    confidence?: number;
    formula?: string;
  };
  note?: string;
};

function ComputeExpectationRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, ExpectationToolResult>,
) {
  const { result, status } = props;
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const exp = result.expectation;
  const player = result.player;
  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <p className="text-sm font-medium">Expected points</p>
      {player?.name ? (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {[player.name, player.team, player.position]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {exp ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Baseline /gw</dt>
            <dd className="font-medium">{Number(exp.baselinePerGw ?? 0).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Adjusted /gw</dt>
            <dd className="font-medium">{Number(exp.adjustedPerGw ?? 0).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              xPts / {exp.horizonGw ?? "?"}gw
            </dt>
            <dd className="text-base font-semibold">
              {Number(exp.expectedPoints ?? 0).toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Band</dt>
            <dd className="font-medium">
              {Number(exp.suggestedFloor ?? 0).toFixed(1)}–
              {Number(exp.suggestedCeiling ?? 0).toFixed(1)}
            </dd>
          </div>
        </dl>
      ) : null}
      {result.note ? (
        <p className="text-muted-foreground mt-2 text-[0.7rem]">{result.note}</p>
      ) : null}
    </div>
  );
}

type ThesisToolResult = {
  error?: string;
  thesis?: Record<string, unknown>;
  theses?: Array<Record<string, unknown>>;
  nextSteps?: string[];
};

function ThesisCard({
  title,
  status,
  summary,
  beliefCount,
  beliefs,
  nextSteps,
}: {
  title: string;
  status: string;
  summary?: string | null;
  beliefCount?: number;
  beliefs?: ThesisBeliefView[];
  nextSteps?: string[];
}) {
  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.1em] uppercase">
          {status}
        </p>
      </div>
      {beliefCount != null ? (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {beliefCount} belief{beliefCount === 1 ? "" : "s"}
        </p>
      ) : null}
      {summary ? (
        <p className="mt-2 text-xs leading-relaxed">{summary}</p>
      ) : null}
      {beliefs && beliefs.length > 0 ? <BeliefList beliefs={beliefs} /> : null}
      {nextSteps && nextSteps.length > 0 ? (
        <ol className="text-muted-foreground mt-2 list-decimal space-y-0.5 ps-4 text-xs">
          {nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function CreateThesisRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, ThesisToolResult>,
) {
  const { result, status } = props;
  const { applyThesisToolResult } = useThesisContext();
  useEffect(() => {
    if (status?.type === "complete" && result && !result.error) {
      applyThesisToolResult(result);
    }
  }, [applyThesisToolResult, result, status?.type]);

  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const thesis = result.thesis;
  return (
    <ThesisCard
      title={String(thesis?.title ?? "Form thesis")}
      status={String(thesis?.status ?? "collecting")}
      beliefCount={Number(thesis?.beliefCount ?? 0)}
      nextSteps={result.nextSteps}
    />
  );
}

function GetThesisRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, ThesisToolResult>,
) {
  const { result, status } = props;
  const { applyThesisToolResult } = useThesisContext();
  useEffect(() => {
    if (status?.type === "complete" && result && !result.error) {
      applyThesisToolResult(result);
    }
  }, [applyThesisToolResult, result, status?.type]);

  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const thesis = result.thesis;
  const beliefs = Array.isArray(thesis?.beliefs)
    ? thesis.beliefs
        .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
        .map(normalizeBelief)
    : [];
  return (
    <ThesisCard
      title={String(thesis?.title ?? "Form thesis")}
      status={String(thesis?.status ?? "collecting")}
      summary={typeof thesis?.summary === "string" ? thesis.summary : null}
      beliefCount={Number(thesis?.beliefCount ?? beliefs.length)}
      beliefs={beliefs}
      nextSteps={result.nextSteps}
    />
  );
}

function SynthesizeThesisRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, ThesisToolResult>,
) {
  return <GetThesisRender {...props} />;
}

function ListThesesRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, ThesisToolResult>,
) {
  const { result, status } = props;
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }
  const theses = result.theses ?? [];
  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <p className="text-sm font-medium">Form theses</p>
      <ul className="mt-2 divide-border/50 divide-y">
        {theses.map((t) => (
          <li key={String(t.id)} className="flex justify-between gap-2 py-1.5 text-xs">
            <span className="font-medium">{String(t.title)}</span>
            <span className="text-muted-foreground uppercase tracking-wide">
              {String(t.status)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const UpsertPlayerBeliefToolUI = makeAssistantToolUI({
  toolName: "upsert_player_belief",
  render: UpsertBeliefRender,
});

export const ComputePlayerExpectationToolUI = makeAssistantToolUI({
  toolName: "compute_player_expectation",
  render: ComputeExpectationRender,
});

export const ListPlayerBeliefsToolUI = makeAssistantToolUI({
  toolName: "list_player_beliefs",
  render: ListBeliefsRender,
});

export const GetPlayerBeliefToolUI = makeAssistantToolUI({
  toolName: "get_player_belief",
  render: GetBeliefRender,
});

export const ClearPlayerBeliefToolUI = makeAssistantToolUI({
  toolName: "clear_player_belief",
  render: ClearBeliefRender,
});

export const CreateFormThesisToolUI = makeAssistantToolUI({
  toolName: "create_form_thesis",
  render: CreateThesisRender,
});

export const GetFormThesisToolUI = makeAssistantToolUI({
  toolName: "get_form_thesis",
  render: GetThesisRender,
});

export const SynthesizeFormThesisToolUI = makeAssistantToolUI({
  toolName: "synthesize_form_thesis",
  render: SynthesizeThesisRender,
});

export const ListFormThesesToolUI = makeAssistantToolUI({
  toolName: "list_form_theses",
  render: ListThesesRender,
});
