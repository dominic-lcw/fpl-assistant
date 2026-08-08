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
  normalizeBelief,
  thesisFromToolResult,
  type ActiveThesisView,
  type ThesisBeliefView,
} from "@/components/fpl/thesis-types";

type ThesisContextValue = {
  activeThesis: ActiveThesisView | null;
  loading: boolean;
  error: string | null;
  setActiveThesis: (thesis: ActiveThesisView | null) => void;
  applyThesisToolResult: (result: unknown) => void;
  mergeBeliefIntoActive: (belief: ThesisBeliefView) => void;
  removeBeliefFromActive: (elementId: number) => Promise<void>;
  refreshActiveThesis: () => Promise<void>;
};

const ThesisReactContext = createContext<ThesisContextValue | null>(null);

export function useThesisContext() {
  const ctx = useContext(ThesisReactContext);
  if (!ctx) {
    throw new Error("useThesisContext must be used within ThesisProvider");
  }
  return ctx;
}

function formatThesisContext(thesis: ActiveThesisView) {
  const lines = [
    `Active thesis group: ${thesis.title}`,
    `Thesis group ID: ${thesis.id}`,
    thesis.gameweek != null ? `Gameweek: ${thesis.gameweek}` : null,
    `Beliefs: ${thesis.beliefCount}`,
    thesis.summary ? `Notes: ${thesis.summary}` : null,
    "Player beliefs (primary):",
  ];
  for (const b of thesis.beliefs.slice(0, 20)) {
    const name = b.name ?? `#${b.elementId}`;
    lines.push(
      `- ${name} (${b.team ?? "?"} ${b.position ?? ""}): formBelief ${b.formBelief >= 0 ? "+" : ""}${b.formBelief.toFixed(1)}, minutesRisk ${b.minutesRisk.toFixed(2)}, confidence ${b.confidence.toFixed(2)}, expectedPoints ${b.expectedPoints != null ? b.expectedPoints.toFixed(1) : "n/a"}/${b.horizonGw}gw, delta ${b.beliefDelta >= 0 ? "+" : ""}${b.beliefDelta.toFixed(2)} — ${b.rationale}`,
    );
  }
  lines.push(
    "Upsert more beliefs as needed, then call suggest_squad (save=true when the user wants it kept). A thesis is only a group label for beliefs; notes are optional.",
  );
  return lines.filter(Boolean).join("\n");
}

export function ThesisProvider({ children }: { children: ReactNode }) {
  const [activeThesis, setActiveThesis] = useState<ActiveThesisView | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshActiveThesis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/theses?active=1");
      if (res.status === 403) {
        setActiveThesis(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load thesis");
      }
      if (!data.thesis) {
        setActiveThesis(null);
        return;
      }
      const parsed = thesisFromToolResult({ thesis: data.thesis });
      setActiveThesis(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thesis");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const res = await fetch("/api/theses?active=1");
        if (cancelled) return;
        if (res.status === 403) {
          setActiveThesis(null);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load thesis");
        }
        if (!cancelled) {
          setActiveThesis(
            data.thesis
              ? thesisFromToolResult({ thesis: data.thesis })
              : null,
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load thesis");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyThesisToolResult = useCallback((result: unknown) => {
    const parsed = thesisFromToolResult(result);
    if (!parsed) return;

    setActiveThesis((prev) => {
      if (!prev || prev.id !== parsed.id) return parsed;
      // Merge beliefs: prefer incoming full list; otherwise merge single belief.
      if (parsed.beliefs.length > 1 || parsed.beliefCount > 1) {
        return parsed;
      }
      if (parsed.beliefs.length === 1) {
        const nextBelief = parsed.beliefs[0]!;
        const others = prev.beliefs.filter(
          (b) => b.elementId !== nextBelief.elementId,
        );
        const beliefs = [nextBelief, ...others];
        return {
          ...parsed,
          beliefs,
          beliefCount: beliefs.length,
          summary: parsed.summary ?? prev.summary,
        };
      }
      return { ...prev, ...parsed, beliefs: prev.beliefs };
    });
  }, []);

  const mergeBeliefIntoActive = useCallback((belief: ThesisBeliefView) => {
    setActiveThesis((prev) => {
      if (!prev || prev.id !== belief.thesisId) {
        return {
          id: belief.thesisId,
          title: "Active beliefs",
          status: "collecting",
          summary: null,
          gameweek: null,
          horizonGw: belief.horizonGw,
          linkedDraftId: null,
          beliefCount: 1,
          beliefs: [belief],
        };
      }
      const others = prev.beliefs.filter((b) => b.elementId !== belief.elementId);
      const beliefs = [belief, ...others];
      return {
        ...prev,
        status: "collecting",
        beliefs,
        beliefCount: beliefs.length,
      };
    });
  }, []);

  const removeBeliefFromActive = useCallback(
    async (elementId: number) => {
      const thesisId = activeThesis?.id;
      if (!thesisId) {
        setError("No active thesis to clear a belief from.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          elementId: String(elementId),
          thesisId,
        });
        const res = await fetch(`/api/theses/beliefs?${params}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Failed to clear belief",
          );
        }
        setActiveThesis((prev) => {
          if (!prev || prev.id !== thesisId) return prev;
          const beliefs = prev.beliefs.filter((b) => b.elementId !== elementId);
          return {
            ...prev,
            beliefs,
            beliefCount: beliefs.length,
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clear belief");
      } finally {
        setLoading(false);
      }
    },
    [activeThesis?.id],
  );

  useAssistantContext({
    getContext: () => {
      if (!activeThesis) {
        return "No active beliefs yet. Upsert player beliefs with upsert_player_belief (a thesis group is created automatically). Then suggest_squad when ready.";
      }
      return formatThesisContext(activeThesis);
    },
    disabled: !ready,
  });

  useAssistantInstructions(
    activeThesis
      ? "When discussing form or squad construction, prefer the active player beliefs in context. Quantify with compute_player_expectation, collect beliefs with upsert_player_belief, then suggest_squad. A thesis is only a group of beliefs; notes are optional."
      : "No active beliefs yet. Upsert player beliefs directly with upsert_player_belief; do not require create_form_thesis or synthesize_form_thesis.",
  );

  const value = useMemo<ThesisContextValue>(
    () => ({
      activeThesis,
      loading,
      error,
      setActiveThesis,
      applyThesisToolResult,
      mergeBeliefIntoActive,
      removeBeliefFromActive,
      refreshActiveThesis,
    }),
    [
      activeThesis,
      loading,
      error,
      applyThesisToolResult,
      mergeBeliefIntoActive,
      removeBeliefFromActive,
      refreshActiveThesis,
    ],
  );

  return (
    <ThesisReactContext.Provider value={value}>
      {children}
    </ThesisReactContext.Provider>
  );
}

// Re-export helpers used by tool UIs
export { normalizeBelief, thesisFromToolResult };
export type { ActiveThesisView, ThesisBeliefView };
