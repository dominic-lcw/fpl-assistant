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
import { useAssistantContext, useAssistantInstructions } from "@assistant-ui/react";
import { isValidManagerIdInput } from "@/lib/fpl/validation";

const STORAGE_KEY = "fpl-assistant.managerId";

type ManagerSnapshot = {
  id: number;
  managerName: string;
  teamName: string;
  overallPoints: number;
  overallRank: number | null;
  eventPoints: number;
  currentEvent: number | null;
  favouriteTeam: string | null;
  classicLeagues: Array<{ id: number; name: string; rank: number | null }>;
};

type GameweekSnapshot = {
  id: number;
  name: string;
  kind: string;
};

type ManagerContextValue = {
  managerId: string | null;
  snapshot: ManagerSnapshot | null;
  gameweek: GameweekSnapshot | null;
  loading: boolean;
  error: string | null;
  setManagerId: (id: string) => Promise<void>;
  clearManager: () => void;
};

const ManagerReactContext = createContext<ManagerContextValue | null>(null);

export function useManagerContext() {
  const ctx = useContext(ManagerReactContext);
  if (!ctx) {
    throw new Error("useManagerContext must be used within ManagerProvider");
  }
  return ctx;
}

async function fetchManager(id: string) {
  const res = await fetch(`/api/manager/${id}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load manager");
  }
  return data as { manager: ManagerSnapshot; gameweek: GameweekSnapshot };
}

export function ManagerProvider({ children }: { children: ReactNode }) {
  const [managerId, setManagerIdState] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ManagerSnapshot | null>(null);
  const [gameweek, setGameweek] = useState<GameweekSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const saved = window.localStorage.getItem(STORAGE_KEY);

    async function hydrate() {
      if (!saved || !isValidManagerIdInput(saved)) {
        if (!cancelled) setReady(true);
        return;
      }

      if (!cancelled) setLoading(true);
      try {
        const data = await fetchManager(saved);
        if (cancelled) return;
        setManagerIdState(saved);
        setSnapshot(data.manager);
        setGameweek(data.gameweek);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load manager");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const setManagerId = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!isValidManagerIdInput(trimmed)) {
      setError("Enter a valid numeric Manager ID.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchManager(trimmed);
      setManagerIdState(trimmed);
      setSnapshot(data.manager);
      setGameweek(data.gameweek);
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manager");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearManager = useCallback(() => {
    setManagerIdState(null);
    setSnapshot(null);
    setGameweek(null);
    setError(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  useAssistantInstructions(
    `You are helping with Fantasy Premier League analysis. Prefer tool-backed answers.`,
  );

  useAssistantContext({
    getContext: () => {
      if (!managerId || !snapshot) {
        return "No Manager ID is selected yet. Ask the user to enter their Manager ID before personalized advice.";
      }
      return [
        `Manager ID: ${managerId}`,
        `Manager name: ${snapshot.managerName}`,
        `Team name: ${snapshot.teamName}`,
        `Overall points: ${snapshot.overallPoints}`,
        snapshot.overallRank != null
          ? `Overall rank: ${snapshot.overallRank}`
          : "Overall rank: unavailable",
        gameweek
          ? `Relevant gameweek: ${gameweek.name} (${gameweek.kind}, id ${gameweek.id})`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    },
    disabled: !ready,
  });

  const value = useMemo(
    () => ({
      managerId,
      snapshot,
      gameweek,
      loading,
      error,
      setManagerId,
      clearManager,
    }),
    [managerId, snapshot, gameweek, loading, error, setManagerId, clearManager],
  );

  return (
    <ManagerReactContext.Provider value={value}>
      {children}
    </ManagerReactContext.Provider>
  );
}

export function ManagerIdBar({ authSlot }: { authSlot?: ReactNode }) {
  const {
    managerId,
    snapshot,
    gameweek,
    loading,
    error,
    setManagerId,
    clearManager,
  } = useManagerContext();
  return (
    <header className="bg-background/90 border-border border-b px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-foreground text-sm font-medium tracking-wide">
            FPL Assistant
          </div>
          {snapshot ? (
            <div className="text-muted-foreground truncate text-sm">
              {snapshot.managerName} · {snapshot.teamName}
              {gameweek ? ` · ${gameweek.name}` : ""}
              {snapshot.overallRank != null
                ? ` · rank ${snapshot.overallRank.toLocaleString()}`
                : ""}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              Enter your Manager ID to personalize advice
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <form
            className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const value = String(form.get("managerId") ?? "");
              void setManagerId(value);
            }}
          >
            <label className="sr-only" htmlFor="manager-id">
              Manager ID
            </label>
            <input
              id="manager-id"
              name="managerId"
              key={managerId ?? "empty"}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Manager ID"
              defaultValue={managerId ?? ""}
              className="border-input bg-background text-foreground focus:border-ring h-9 w-full rounded-lg border px-3 text-sm outline-none sm:w-44"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-primary text-primary-foreground hover:bg-primary/80 h-9 rounded-lg px-3 text-sm font-medium transition disabled:opacity-60"
              >
                {loading ? "Loading…" : snapshot ? "Update" : "Connect"}
              </button>
              {snapshot ? (
                <button
                  type="button"
                  onClick={clearManager}
                  className="border-border text-foreground hover:bg-muted h-9 rounded-lg border px-3 text-sm transition"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </form>
          {authSlot}
        </div>
      </div>
      {error ? (
        <p className="text-destructive mx-auto mt-2 max-w-5xl text-sm">
          {error}
        </p>
      ) : (
        <p className="text-muted-foreground mx-auto mt-2 max-w-5xl text-xs">
          Find your Manager ID in the FPL site URL under Points / Gameweek
          history (the number before <code>/history</code>).
        </p>
      )}
    </header>
  );
}
