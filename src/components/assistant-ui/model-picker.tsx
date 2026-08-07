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
  DEFAULT_KIMI_MODEL_ID,
  KIMI_MODEL_STORAGE_KEY,
  KIMI_MODELS,
  getKimiModel,
  isKimiModelId,
  type KimiModelId,
} from "@/lib/kimi/models";
import { cn } from "@/lib/utils";

type ModelContextValue = {
  modelId: KimiModelId;
  setModelId: (id: KimiModelId) => void;
  contextWindow: number;
};

const ModelReactContext = createContext<ModelContextValue | null>(null);

export function useModelSelection() {
  const ctx = useContext(ModelReactContext);
  if (!ctx) {
    throw new Error("useModelSelection must be used within ModelProvider");
  }
  return ctx;
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const [modelId, setModelIdState] = useState<KimiModelId>(DEFAULT_KIMI_MODEL_ID);

  useEffect(() => {
    let cancelled = false;

    // Defer so hydration stays in sync with the server default, then restore.
    queueMicrotask(() => {
      if (cancelled) return;
      const saved = window.localStorage.getItem(KIMI_MODEL_STORAGE_KEY);
      if (isKimiModelId(saved)) {
        setModelIdState(saved);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setModelId = useCallback((id: KimiModelId) => {
    setModelIdState(id);
    window.localStorage.setItem(KIMI_MODEL_STORAGE_KEY, id);
  }, []);

  const value = useMemo(
    () => ({
      modelId,
      setModelId,
      contextWindow: getKimiModel(modelId).contextWindow,
    }),
    [modelId, setModelId],
  );

  return (
    <ModelReactContext.Provider value={value}>
      {children}
    </ModelReactContext.Provider>
  );
}

export function ModelPicker({ className }: { className?: string }) {
  const { modelId, setModelId } = useModelSelection();

  return (
    <label className={cn("inline-flex items-center", className)}>
      <span className="sr-only">Model</span>
      <select
        value={modelId}
        onChange={(event) => {
          const next = event.target.value;
          if (isKimiModelId(next)) setModelId(next);
        }}
        className="border-border/60 bg-background text-muted-foreground hover:text-foreground focus:border-ring h-7 max-w-[9.5rem] cursor-pointer rounded-full border px-2 text-xs outline-none"
        aria-label="Select Kimi model"
      >
        {KIMI_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}
