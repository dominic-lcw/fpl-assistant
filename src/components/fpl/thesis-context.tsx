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
    `Active form thesis: ${thesis.title}`,
    `Thesis ID: ${thesis.id}`,
    `Status: ${thesis.status}`,
    thesis.gameweek != null ? `Gameweek: ${thesis.gameweek}` : null,
    `Beliefs: ${thesis.beliefCount}`,
    thesis.summary ? `Synthesis: ${thesis.summary}` : null,
    "Player beliefs:",
  ];
  for (const b of thesis.beliefs.slice(0, 20)) {
    const name = b.name ?? `#${b.elementId}`;
    lines.push(
      `- ${name} (${b.team ?? "?"} ${b.position ?? ""}): formBelief ${b.formBelief >= 0 ? "+" : ""}${b.formBelief.toFixed(1)}, minutesRisk ${b.minutesRisk.toFixed(2)}, confidence ${b.confidence.toFixed(2)}, expectedPoints ${b.expectedPoints != null ? b.expectedPoints.toFixed(1) : "n/a"}/${b.horizonGw}gw, delta ${b.beliefDelta >= 0 ? "+" : ""}${b.beliefDelta.toFixed(2)} — ${b.rationale}`,
    );
  }
  if (thesis.status === "collecting") {
    lines.push(
      "Thesis is collecting. Upsert more beliefs as needed, then call synthesize_form_thesis before suggest_squad.",
    );
  } else if (thesis.status === "synthesized") {
    lines.push(
      "Thesis is synthesized. Call suggest_squad (save=true when the user wants it kept) to build the final team.",
    );
  }
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
          title: "Form thesis",
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

  useAssistantContext({
    getContext: () => {
      if (!activeThesis) {
        return "No active form thesis. Create one with create_form_thesis before storing player beliefs, then synthesize_form_thesis before suggest_squad.";
      }
      return formatThesisContext(activeThesis);
    },
    disabled: !ready,
  });

  useAssistantInstructions(
    activeThesis
      ? "When discussing form or squad construction, prefer the Active form thesis in context. Quantify with compute_player_expectation, collect beliefs with upsert_player_belief, synthesize with synthesize_form_thesis, then suggest_squad."
      : "No active form thesis. Create one with create_form_thesis before storing player beliefs.",
  );

  const value = useMemo<ThesisContextValue>(
    () => ({
      activeThesis,
      loading,
      error,
      setActiveThesis,
      applyThesisToolResult,
      mergeBeliefIntoActive,
      refreshActiveThesis,
    }),
    [
      activeThesis,
      loading,
      error,
      applyThesisToolResult,
      mergeBeliefIntoActive,
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
