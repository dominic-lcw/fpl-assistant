"use client";

import { useState } from "react";
import {
  ClipboardListIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";

import { useDraftContext } from "@/components/fpl/draft-context";
import {
  picksByPosition,
  type DraftPickView,
  type DraftPosition,
} from "@/components/fpl/draft-types";
import { BeliefCard } from "@/components/fpl/beliefs-tool-ui";
import { useThesisContext } from "@/components/fpl/thesis-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

const POSITIONS: DraftPosition[] = ["GKP", "DEF", "MID", "FWD"];

function money(value: number) {
  return `£${value.toFixed(1)}m`;
}

function PickRow({ pick }: { pick: DraftPickView }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1 text-sm">
      <div className="min-w-0">
        <span className="text-foreground font-medium">{pick.webName}</span>
        <span className="text-muted-foreground ml-1.5 text-xs">
          {pick.teamShort}
          {pick.isCaptain ? " · C" : ""}
          {pick.isViceCaptain ? " · VC" : ""}
          {pick.pickPosition > 11 ? " · Bench" : ""}
        </span>
      </div>
      <div className="text-muted-foreground shrink-0 tabular-nums text-xs">
        {money(pick.cost)}
        <span className="ml-1.5 text-[0.7rem]">f{pick.form.toFixed(1)}</span>
      </div>
    </li>
  );
}

function PositionBlock({
  position,
  picks,
}: {
  position: DraftPosition;
  picks: DraftPickView[];
}) {
  return (
    <section className="border-border/70 border-b py-2 last:border-b-0">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
          {position}
        </h3>
        <span className="text-muted-foreground text-[0.7rem] tabular-nums">
          {picks.length}
        </span>
      </div>
      {picks.length === 0 ? (
        <p className="text-muted-foreground/80 py-1 text-xs italic">Empty</p>
      ) : (
        <ul className="divide-border/40 divide-y">
          {picks.map((pick) => (
            <PickRow key={pick.elementId} pick={pick} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DraftStatsFooter() {
  const { activeDraft } = useDraftContext();
  if (!activeDraft) {
    return (
      <div className="text-muted-foreground flex h-full flex-col justify-center px-3 text-xs">
        <p className="font-medium text-foreground/80">Squad stats</p>
        <p className="mt-1 leading-relaxed">
          Cost, bank, form, and fixture scores will land here once a draft is
          active.
        </p>
      </div>
    );
  }

  const avgForm =
    activeDraft.picks.length === 0
      ? 0
      : activeDraft.picks.reduce((s, p) => s + p.form, 0) /
        activeDraft.picks.length;
  const avgFixture =
    activeDraft.picks.length === 0
      ? 0
      : activeDraft.picks.reduce((s, p) => s + p.fixtureRunScore, 0) /
        activeDraft.picks.length;
  const starters = activeDraft.picks.filter((p) => p.pickPosition <= 11);
  const bench = activeDraft.picks.filter((p) => p.pickPosition > 11);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-3 text-sm">
      <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
        Stats
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Budget</dt>
          <dd className="tabular-nums font-medium">
            {money(activeDraft.budget)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Spent</dt>
          <dd className="tabular-nums font-medium">
            {money(activeDraft.cost)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bank</dt>
          <dd className="tabular-nums font-medium">
            {money(activeDraft.bank)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Avg form</dt>
          <dd className="tabular-nums font-medium">{avgForm.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Avg fixture run</dt>
          <dd className="tabular-nums font-medium">
            {avgFixture.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Score</dt>
          <dd className="tabular-nums font-medium">
            {activeDraft.averageScore != null
              ? activeDraft.averageScore.toFixed(1)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Starters / bench</dt>
          <dd className="tabular-nums font-medium">
            {starters.length} / {bench.length}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Mode</dt>
          <dd className="font-medium">
            {activeDraft.mode === "draft_100" ? "£100m" : "Wildcard"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ThesisRailSection() {
  const {
    activeThesis,
    loading,
    error,
    refreshActiveThesis,
    removeBeliefFromActive,
  } = useThesisContext();

  return (
    <div className="border-border flex min-h-0 flex-col border-b">
      <div className="flex shrink-0 items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
            Thesis
          </p>
          <p className="truncate text-sm font-medium">
            {activeThesis?.title ?? "No active thesis"}
          </p>
          {activeThesis ? (
            <p className="text-muted-foreground mt-0.5 text-xs">
              <span className="uppercase tracking-wide">{activeThesis.status}</span>
              {" · "}
              {activeThesis.beliefCount} belief
              {activeThesis.beliefCount === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-xs">
              Ask chat to create a form thesis, then add player beliefs.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh thesis"
          onClick={() => void refreshActiveThesis()}
          disabled={loading}
        >
          {loading ? (
            <LoaderIcon className="animate-spin" />
          ) : (
            <RefreshCwIcon />
          )}
        </Button>
      </div>
      {activeThesis?.summary ? (
        <p className="text-muted-foreground px-3 pb-2 text-[0.7rem] leading-relaxed">
          {activeThesis.summary}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive px-3 pb-2 text-xs">{error}</p>
      ) : null}
      <div className="max-h-40 min-h-0 overflow-y-auto px-3 pb-2">
        {activeThesis && activeThesis.beliefs.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {activeThesis.beliefs.map((belief) => (
              <li key={belief.id || belief.elementId}>
                <BeliefCard
                  belief={belief}
                  deleting={loading}
                  onDelete={(target) => {
                    const name = target.name ?? `#${target.elementId}`;
                    if (
                      !window.confirm(
                        `Clear belief for ${name}? This cannot be undone.`,
                      )
                    ) {
                      return;
                    }
                    void removeBeliefFromActive(target.elementId);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground/80 py-1 text-xs italic">
            Beliefs will appear here as the thesis is built.
          </p>
        )}
      </div>
    </div>
  );
}

function DraftSelectionBody() {
  const {
    activeDraft,
    drafts,
    loading,
    error,
    wantsNewDraft,
    loadDraft,
    deleteDraft,
    refreshDrafts,
    startNewDraft,
  } = useDraftContext();

  const groups = activeDraft ? picksByPosition(activeDraft.picks) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
            Selection
          </p>
          <p className="truncate text-sm font-medium">
            {wantsNewDraft
              ? "New draft"
              : (activeDraft?.title ?? "No active draft")}
          </p>
          {activeDraft ? (
            <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
              {money(activeDraft.cost)} / {money(activeDraft.budget)} · ITB{" "}
              {money(activeDraft.bank)}
              {activeDraft.status === "ephemeral" ? " · unsaved" : ""}
            </p>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-xs">
              Ask the assistant to build a squad, or load a saved draft.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh drafts"
            onClick={() => void refreshDrafts()}
            disabled={loading}
          >
            {loading ? (
              <LoaderIcon className="animate-spin" />
            ) : (
              <RefreshCwIcon />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={startNewDraft}
          >
            <PlusIcon />
            New
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-destructive px-3 py-2 text-xs">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {groups ? (
          POSITIONS.map((pos) => (
            <PositionBlock key={pos} position={pos} picks={groups[pos]} />
          ))
        ) : (
          <div className="text-muted-foreground py-6 text-xs leading-relaxed">
            <p>
              No players selected yet. Try “Build me a legal £100m draft and
              save it” in chat.
            </p>
          </div>
        )}
      </div>

      {drafts.length > 0 ? (
        <div className="border-border shrink-0 border-t px-3 py-2">
          <p className="text-muted-foreground mb-1.5 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
            Saved
          </p>
          <ul className="flex max-h-24 flex-col gap-1 overflow-y-auto">
            {drafts.slice(0, 8).map((d) => (
              <li
                key={d.id}
                className={cn(
                  "hover:bg-muted/60 group flex items-center gap-0.5 rounded-md transition-colors",
                  activeDraft?.id === d.id && "bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => void loadDraft(d.id)}
                  className="min-w-0 flex-1 px-2 py-1 text-left text-xs"
                >
                  <span className="text-foreground font-medium">{d.title}</span>
                  <span className="text-muted-foreground ml-1.5 tabular-nums">
                    {money(d.cost)}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${d.title}`}
                  className="text-muted-foreground hover:text-destructive me-0.5 opacity-70 group-hover:opacity-100"
                  disabled={loading}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (
                      !window.confirm(
                        `Delete saved draft “${d.title}”? This cannot be undone.`,
                      )
                    ) {
                      return;
                    }
                    void deleteDraft(d.id);
                  }}
                >
                  <TrashIcon />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Desktop right rail: vertical split — thesis + selection on top, stats below. */
export function DraftSideRail({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "border-border bg-muted/15 flex h-full min-h-0 flex-col border-l",
        className,
      )}
    >
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="72%" minSize="40%">
          <div className="flex h-full min-h-0 flex-col">
            <ThesisRailSection />
            <div className="min-h-0 flex-1">
              <DraftSelectionBody />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="28%" minSize="18%">
          <DraftStatsFooter />
        </ResizablePanel>
      </ResizablePanelGroup>
    </aside>
  );
}

/** Mobile drawer trigger for the same draft panel. */
export function MobileDraftPanel() {
  const [open, setOpen] = useState(false);
  const { activeDraft } = useDraftContext();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open squad draft"
            className="relative md:hidden"
          />
        }
      >
        <ClipboardListIcon />
        {activeDraft ? (
          <span className="bg-primary absolute top-1.5 right-1.5 size-1.5 rounded-full" />
        ) : null}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="bg-background inset-y-0 right-0 left-auto h-dvh w-80 max-w-[90vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-[90vw]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Squad draft</DialogTitle>
          <DialogDescription>
            Current 15-player selection by position and draft stats.
          </DialogDescription>
        </DialogHeader>
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Squad draft</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <XIcon />
          </Button>
        </div>
        <div className="h-[calc(100dvh-2.75rem)]">
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel defaultSize="70%" minSize="40%">
              <div className="flex h-full min-h-0 flex-col">
                <ThesisRailSection />
                <div className="min-h-0 flex-1">
                  <DraftSelectionBody />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="30%" minSize="18%">
              <DraftStatsFooter />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
