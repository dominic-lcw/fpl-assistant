"use client";

import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { cn } from "@/lib/utils";

type ComparisonRow = {
  id?: number;
  name?: string;
  team?: string;
  position?: string;
  cost?: number;
  form?: number;
  xgi?: number;
  ownership?: number;
  fixtureRunScore?: number;
  score?: number;
  fixturesLabel?: string;
  status?: string;
  news?: string;
  why?: string;
};

type SuggestionsResult = {
  error?: string;
  gameweek?: { id?: number; name?: string };
  bank?: number;
  comparisons?: {
    captain?: ComparisonRow[];
    transferIn?: ComparisonRow[];
    transferOut?: ComparisonRow[];
  };
  researchTargets?: string[];
  disclaimer?: string;
};

type CompareResult = {
  error?: string;
  comparison?: ComparisonRow[];
  researchTargets?: string[];
  disclaimer?: string;
};

function money(value: number | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `£${value.toFixed(1)}m`;
}

function ComparisonTable({
  title,
  rows,
}: {
  title: string;
  rows: ComparisonRow[] | undefined;
}) {
  if (!rows?.length) return null;
  return (
    <section className="mt-3">
      <h4 className="text-muted-foreground mb-1.5 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
        {title}
      </h4>
      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Player</th>
              <th className="px-2 py-1.5 font-medium">£</th>
              <th className="px-2 py-1.5 font-medium">Form</th>
              <th className="px-2 py-1.5 font-medium">xGI</th>
              <th className="px-2 py-1.5 font-medium">Own%</th>
              <th className="px-2 py-1.5 font-medium">Fix</th>
              <th className="px-2 py-1.5 font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="divide-border/50 divide-y">
            {rows.map((row, index) => (
              <tr
                key={row.id ?? `${row.name}-${index}`}
                className={cn(index === 0 && "bg-primary/5")}
              >
                <td className="px-2 py-1.5">
                  <div className="font-medium">
                    {row.name}
                    <span className="text-muted-foreground ml-1 font-normal">
                      {row.team} · {row.position}
                    </span>
                  </div>
                  {row.status && row.status !== "a" ? (
                    <div className="text-amber-700 dark:text-amber-300 mt-0.5">
                      {row.status}
                      {row.news ? ` — ${row.news}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{money(row.cost)}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {row.form?.toFixed(1) ?? "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {row.xgi?.toFixed(2) ?? "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {row.ownership?.toFixed(1) ?? "—"}
                </td>
                <td className="text-muted-foreground max-w-[9rem] px-2 py-1.5">
                  {row.fixturesLabel ?? "—"}
                </td>
                <td className="text-muted-foreground max-w-[14rem] px-2 py-1.5">
                  {row.why ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResearchTargets({ targets }: { targets?: string[] }) {
  if (!targets?.length) return null;
  return (
    <div className="border-amber-500/30 bg-amber-500/5 mt-3 rounded-lg border px-3 py-2">
      <p className="text-xs font-medium">Needs web/news check</p>
      <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 ps-4 text-xs">
        {targets.map((target) => (
          <li key={target}>{target}</li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionsToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, SuggestionsResult>,
) {
  const { result, status } = props;
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }

  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Suggestion comparison</p>
        <p className="text-muted-foreground text-xs">
          {result.gameweek?.name ?? "Gameweek"}
          {result.bank != null ? ` · bank £${result.bank.toFixed(1)}m` : ""}
        </p>
      </div>
      <ComparisonTable title="Captain" rows={result.comparisons?.captain} />
      <ComparisonTable
        title="Transfer out"
        rows={result.comparisons?.transferOut}
      />
      <ComparisonTable
        title="Transfer in"
        rows={result.comparisons?.transferIn}
      />
      <ResearchTargets targets={result.researchTargets} />
      {result.disclaimer ? (
        <p className="text-muted-foreground mt-2 text-[0.7rem] leading-relaxed">
          {result.disclaimer}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="text-muted-foreground cursor-pointer text-xs">
          Raw tool payload
        </summary>
        <div className="mt-1">
          <ToolFallback {...props} />
        </div>
      </details>
    </div>
  );
}

function ComparePlayersRender(
  props: ToolCallMessagePartProps<Record<string, unknown>, CompareResult>,
) {
  const { result, status } = props;
  if (status?.type !== "complete" || !result || result.error) {
    return <ToolFallback {...props} />;
  }

  return (
    <div className="border-border/70 my-2 w-full rounded-xl border px-3 py-3">
      <p className="text-sm font-medium">Player comparison</p>
      <ComparisonTable title="Side-by-side" rows={result.comparison} />
      <ResearchTargets targets={result.researchTargets} />
      {result.disclaimer ? (
        <p className="text-muted-foreground mt-2 text-[0.7rem] leading-relaxed">
          {result.disclaimer}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="text-muted-foreground cursor-pointer text-xs">
          Raw tool payload
        </summary>
        <div className="mt-1">
          <ToolFallback {...props} />
        </div>
      </details>
    </div>
  );
}

export const GetSuggestionsToolUI = makeAssistantToolUI({
  toolName: "get_suggestions",
  render: SuggestionsToolUI,
});

export const ComparePlayersToolUI = makeAssistantToolUI({
  toolName: "compare_players",
  render: ComparePlayersRender,
});
