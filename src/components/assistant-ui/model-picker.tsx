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
  DEFAULT_LLM_MODEL_ID,
  LLM_MODEL_STORAGE_KEY,
  LLM_MODELS,
  getLlmModel,
  isLlmModelId,
  type LlmModelId,
} from "@/lib/llm/models";
import { cn } from "@/lib/utils";

type ModelContextValue = {
  modelId: LlmModelId;
  setModelId: (id: LlmModelId) => void;
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
  const [modelId, setModelIdState] = useState<LlmModelId>(DEFAULT_LLM_MODEL_ID);

  useEffect(() => {
    let cancelled = false;

    // Defer so hydration stays in sync with the server default, then restore.
    queueMicrotask(() => {
      if (cancelled) return;
      const saved = window.localStorage.getItem(LLM_MODEL_STORAGE_KEY);
      if (isLlmModelId(saved)) {
        setModelIdState(saved);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setModelId = useCallback((id: LlmModelId) => {
    setModelIdState(id);
    window.localStorage.setItem(LLM_MODEL_STORAGE_KEY, id);
  }, []);

  const value = useMemo(
    () => ({
      modelId,
      setModelId,
      contextWindow: getLlmModel(modelId).contextWindow,
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
          if (isLlmModelId(next)) setModelId(next);
        }}
        className="border-border/60 bg-background text-muted-foreground hover:text-foreground focus:border-ring h-7 max-w-[9.5rem] cursor-pointer rounded-full border px-2 text-xs outline-none"
        aria-label="Select Azure Foundry model"
      >
        {LLM_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}
