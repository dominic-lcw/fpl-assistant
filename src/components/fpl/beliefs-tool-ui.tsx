"use client";

import { useEffect, useState } from "react";
import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { CircleHelpIcon, TrashIcon } from "lucide-react";

import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import {
  normalizeBelief,
  useThesisContext,
  type ThesisBeliefView,
} from "@/components/fpl/thesis-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function signed(value: number, digits = 1) {
  const abs = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${abs}` : value < 0 ? `−${abs}` : abs;
}

function CalculationDialog({ belief }: { belief: ThesisBeliefView }) {
  const [open, setOpen] = useState(false);
  const adjustedPerGw =
    belief.expectedPoints == null
      ? null
      : belief.expectedPoints / belief.horizonGw;
  const formAdjustment = belief.formBelief * belief.confidence * 0.75;
  const minutesFactor = 1 - belief.minutesRisk * belief.confidence;
  const baselinePerGw =
    adjustedPerGw != null && minutesFactor > 0
      ? adjustedPerGw / minutesFactor - formAdjustment
      : null;
  const spread = (1 - belief.confidence) * 0.35 + 0.12;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Explain ${belief.name ?? "player"} belief calculation`}
            className="text-muted-foreground hover:text-foreground -my-1 -mr-1"
          />
        }
      >
        <CircleHelpIcon />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            How {belief.name ?? `player #${belief.elementId}`} is calculated
          </DialogTitle>
          <DialogDescription>
            The stored belief inputs are used to produce the displayed
            synthesized values.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <section>
            <p className="font-medium">Expected points</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              xPts = max(0, (FPL baseline + form belief × confidence × 0.75) ×
              (1 − minutes risk × confidence)) × gameweeks
            </p>
            {adjustedPerGw != null ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                <div>
                  <dt className="text-muted-foreground">
                    Reconstructed FPL baseline / GW
                  </dt>
                  <dd className="font-medium">
                    {baselinePerGw == null
                      ? "Not recoverable"
                      : baselinePerGw.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Adjusted / GW</dt>
                  <dd className="font-medium">{adjustedPerGw.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Form adjustment / GW</dt>
                  <dd className="font-medium">{signed(formAdjustment, 2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Minutes factor</dt>
                  <dd className="font-medium">{minutesFactor.toFixed(2)}×</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Horizon</dt>
                  <dd className="font-medium">{belief.horizonGw} GW</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">xPts</dt>
                  <dd className="font-medium">
                    {belief.expectedPoints?.toFixed(1)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">
                Expected points have not been computed for this belief.
              </p>
            )}
          </section>
          <section>
            <p className="font-medium">Recommendation delta</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Δ = (form belief × confidence × 1.4) − (minutes risk ×
              confidence × 3), capped between −4 and +4.
            </p>
            <p className="mt-1 text-xs tabular-nums">
              {signed(belief.formBelief, 1)} × {belief.confidence.toFixed(2)} ×
              {" "}1.4 − {belief.minutesRisk.toFixed(2)} ×{" "}
              {belief.confidence.toFixed(2)} × 3 ={" "}
              <span className="font-medium">{signed(belief.beliefDelta, 2)}</span>
            </p>
          </section>
          {belief.floor != null && belief.ceiling != null ? (
            <section>
              <p className="font-medium">Range</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                The range applies a {(spread * 100).toFixed(1)}% spread around
                xPts. Lower confidence widens it.
              </p>
              <p className="mt-1 text-xs tabular-nums">
                {belief.expectedPoints?.toFixed(1)} × (1 ± {spread.toFixed(3)})
                {" "}= {belief.floor.toFixed(1)}–{belief.ceiling.toFixed(1)}
              </p>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BeliefCard({
  belief,
  onDelete,
  deleting = false,
}: {
  belief: ThesisBeliefView;
  onDelete?: (belief: ThesisBeliefView) => void;
  deleting?: boolean;
}) {
  const deltaPositive = belief.beliefDelta >= 0;
  const label = belief.name ?? `#${belief.elementId}`;
  return (
    <article className="border-border/60 bg-background/80 group/belief rounded-lg border px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {label}
            <span className="text-muted-foreground ml-1 font-normal">
              {[belief.team, belief.position].filter(Boolean).join(" · ")}
            </span>
          </p>
        </div>
        <div className="text-muted-foreground ml-auto flex shrink-0 items-center gap-2 tabular-nums">
          {belief.expectedPoints != null ? (
            <span className="text-foreground font-semibold">
              {belief.expectedPoints.toFixed(1)} xPts/{belief.horizonGw}
            </span>
          ) : null}
          <span
            className={cn(
              "font-semibold",
              deltaPositive
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300",
            )}
          >
            Δ {signed(belief.beliefDelta)}
          </span>
          <CalculationDialog belief={belief} />
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete belief for ${label}`}
              className="text-muted-foreground hover:text-destructive -my-1 -mr-1 opacity-70 group-hover/belief:opacity-100"
              disabled={deleting}
              onClick={() => onDelete(belief)}
            >
              <TrashIcon />
            </Button>
          ) : null}
        </div>
      </div>
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
