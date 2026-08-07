"use client";

import { useEffect } from "react";
import {
  makeAssistantToolUI,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { useDraftContext } from "@/components/fpl/draft-context";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";

function SuggestSquadToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  const { applySuggestResult, clearWantsNewDraft } = useDraftContext();
  const { result, status } = props;

  useEffect(() => {
    if (status?.type !== "complete" || result == null) return;
    applySuggestResult(result);
    clearWantsNewDraft();
  }, [result, status?.type, applySuggestResult, clearWantsNewDraft]);

  return <ToolFallback {...props} />;
}

function GetSquadDraftToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  const { applySuggestResult } = useDraftContext();
  const { result, status } = props;

  useEffect(() => {
    if (status?.type !== "complete" || result == null) return;
    if (typeof result !== "object" || result === null) return;
    const raw = result as Record<string, unknown>;
    if (raw.error || !Array.isArray(raw.picks)) return;
    // get_squad_draft returns a serialized draft shape
    applySuggestResult({
      mode: raw.mode,
      picks: raw.picks,
      budget: raw.budget,
      bank: raw.bank,
      cost: raw.cost,
      valid: true,
      gameweek: raw.gameweek,
      managerId: raw.managerId,
      saved: raw,
    });
  }, [result, status?.type, applySuggestResult]);

  return <ToolFallback {...props} />;
}

export const SuggestSquadToolSync = makeAssistantToolUI({
  toolName: "suggest_squad",
  render: SuggestSquadToolUI,
});

export const GetSquadDraftToolSync = makeAssistantToolUI({
  toolName: "get_squad_draft",
  render: GetSquadDraftToolUI,
});
