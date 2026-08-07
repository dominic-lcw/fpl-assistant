"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useAssistantContext,
  useAssistantInstructions,
} from "@assistant-ui/react";

import {
  draftFromApi,
  draftFromSuggestResult,
  picksByPosition,
  type DraftListItem,
  type DraftSummary,
} from "@/components/fpl/draft-types";

const ACTIVE_DRAFT_KEY = "fpl-assistant.activeDraftId";

type DraftContextValue = {
  activeDraft: DraftSummary | null;
  drafts: DraftListItem[];
  loading: boolean;
  error: string | null;
  wantsNewDraft: boolean;
  setActiveDraft: (draft: DraftSummary | null) => void;
  applySuggestResult: (result: unknown) => void;
  loadDraft: (draftId: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;
  startNewDraft: () => void;
  clearWantsNewDraft: () => void;
};

const DraftReactContext = createContext<DraftContextValue | null>(null);

export function useDraftContext() {
  const ctx = useContext(DraftReactContext);
  if (!ctx) {
    throw new Error("useDraftContext must be used within DraftProvider");
  }
  return ctx;
}

function formatActiveDraftContext(draft: DraftSummary) {
  const byPos = picksByPosition(draft.picks);
  const lines = [
    `Active squad draft: ${draft.title}`,
    draft.id ? `Draft ID: ${draft.id}` : "Draft ID: unsaved (ephemeral)",
    `Mode: ${draft.mode}`,
    `Status: ${draft.status}`,
    `Budget: £${draft.budget.toFixed(1)}m | Cost: £${draft.cost.toFixed(1)}m | Bank: £${draft.bank.toFixed(1)}m`,
    draft.gameweek != null ? `Gameweek: ${draft.gameweek}` : null,
    draft.valid === false ? "Validity: issues present — review before advising" : null,
    "Current selection by position:",
  ];
  for (const pos of ["GKP", "DEF", "MID", "FWD"] as const) {
    const names = byPos[pos]
      .map((p) => {
        const tags = [
          p.isCaptain ? "C" : null,
          p.isViceCaptain ? "VC" : null,
        ].filter(Boolean);
        return `${p.webName} (${p.teamShort}, £${p.cost.toFixed(1)}m${tags.length ? `, ${tags.join("/")}` : ""})`;
      })
      .join("; ");
    lines.push(`- ${pos}: ${names || "(empty)"}`);
  }
  lines.push(
    "Treat this as the working squad. Advise on these players, or call suggest_squad to create/replace a draft. Prefer save=true when the user wants it kept.",
  );
  return lines.filter(Boolean).join("\n");
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [activeDraft, setActiveDraftState] = useState<DraftSummary | null>(
    null,
  );
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wantsNewDraft, setWantsNewDraft] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drafts");
      if (res.status === 403) {
        setDrafts([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load drafts");
      }
      const list = Array.isArray(data.drafts)
        ? (data.drafts as Record<string, unknown>[]).map((d) => ({
            id: String(d.id),
            title: String(d.title ?? "Draft"),
            mode: (d.mode === "wildcard" ? "wildcard" : "draft_100") as
              | "draft_100"
              | "wildcard",
            status: String(d.status ?? "draft"),
            budget: Number(d.budget) || 0,
            cost: Number(d.cost) || 0,
            bank: Number(d.bank) || 0,
            gameweek: d.gameweek != null ? Number(d.gameweek) : null,
            managerId: d.managerId != null ? Number(d.managerId) : null,
            pickCount: Array.isArray(d.picks) ? d.picks.length : 0,
            updatedAt: String(d.updatedAt ?? ""),
          }))
        : [];
      setDrafts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDraft = useCallback(async (draftId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draftId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load draft");
      }
      const draft = draftFromApi(data.draft as Record<string, unknown>);
      setActiveDraftState(draft);
      setWantsNewDraft(false);
      if (draft.id) {
        window.localStorage.setItem(ACTIVE_DRAFT_KEY, draft.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load draft");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      await refreshDrafts();
      if (cancelled) return;
      const savedId = window.localStorage.getItem(ACTIVE_DRAFT_KEY);
      if (savedId) {
        try {
          const res = await fetch(`/api/drafts/${savedId}`);
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              setActiveDraftState(
                draftFromApi(data.draft as Record<string, unknown>),
              );
            }
          } else {
            window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
          }
        } catch {
          // ignore hydrate errors
        }
      }
      if (!cancelled) setReady(true);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [refreshDrafts]);

  const setActiveDraft = useCallback((draft: DraftSummary | null) => {
    setActiveDraftState(draft);
    setWantsNewDraft(false);
    if (draft?.id) {
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, draft.id);
    }
  }, []);

  const applySuggestResult = useCallback((result: unknown) => {
    if (!result || typeof result !== "object") return;
    const draft = draftFromSuggestResult(result as Record<string, unknown>);
    if (!draft) return;
    setActiveDraftState(draft);
    setWantsNewDraft(false);
    if (draft.id) {
      window.localStorage.setItem(ACTIVE_DRAFT_KEY, draft.id);
      void fetch("/api/drafts")
        .then((r) => r.json())
        .then((data) => {
          if (!Array.isArray(data.drafts)) return;
          setDrafts(
            data.drafts.map((d: Record<string, unknown>) => ({
              id: String(d.id),
              title: String(d.title ?? "Draft"),
              mode: (d.mode === "wildcard" ? "wildcard" : "draft_100") as
                | "draft_100"
                | "wildcard",
              status: String(d.status ?? "draft"),
              budget: Number(d.budget) || 0,
              cost: Number(d.cost) || 0,
              bank: Number(d.bank) || 0,
              gameweek: d.gameweek != null ? Number(d.gameweek) : null,
              managerId: d.managerId != null ? Number(d.managerId) : null,
              pickCount: Array.isArray(d.picks) ? d.picks.length : 0,
              updatedAt: String(d.updatedAt ?? ""),
            })),
          );
        })
        .catch(() => undefined);
    }
  }, []);

  const startNewDraft = useCallback(() => {
    setActiveDraftState(null);
    setWantsNewDraft(true);
    window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
  }, []);

  const clearWantsNewDraft = useCallback(() => {
    setWantsNewDraft(false);
  }, []);

  useAssistantInstructions(
    wantsNewDraft
      ? "The user cleared the working squad and wants a new draft. Use suggest_squad (draft_100 or wildcard) with save=true when they confirm. Do not assume an existing selection."
      : "When discussing squad selection, prefer the Active squad draft in context. Use suggest_squad to refresh or create drafts; list_squad_drafts / get_squad_draft for saved ones.",
  );

  useAssistantContext({
    getContext: () => {
      if (wantsNewDraft) {
        return "No active squad draft. User requested a new draft — build one with suggest_squad when appropriate.";
      }
      if (!activeDraft) {
        return "No active squad draft is selected in the UI. Offer to build a £100m draft or wildcard, or load a saved draft.";
      }
      return formatActiveDraftContext(activeDraft);
    },
    disabled: !ready,
  });

  const value = useMemo(
    () => ({
      activeDraft,
      drafts,
      loading,
      error,
      wantsNewDraft,
      setActiveDraft,
      applySuggestResult,
      loadDraft,
      refreshDrafts,
      startNewDraft,
      clearWantsNewDraft,
    }),
    [
      activeDraft,
      drafts,
      loading,
      error,
      wantsNewDraft,
      setActiveDraft,
      applySuggestResult,
      loadDraft,
      refreshDrafts,
      startNewDraft,
      clearWantsNewDraft,
    ],
  );

  return (
    <DraftReactContext.Provider value={value}>
      {children}
    </DraftReactContext.Provider>
  );
}
