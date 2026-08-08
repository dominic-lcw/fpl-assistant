export const LLM_MODELS = [
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    contextWindow: 1_050_000,
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    contextWindow: 1_050_000,
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    contextWindow: 1_050_000,
  },
] as const;

export type LlmModelId = (typeof LLM_MODELS)[number]["id"];

export const DEFAULT_LLM_MODEL_ID: LlmModelId = "gpt-5.6-terra";

export const LLM_MODEL_STORAGE_KEY = "fpl-assistant.llmModel";

const MODEL_IDS = new Set<string>(LLM_MODELS.map((model) => model.id));

export function isLlmModelId(value: unknown): value is LlmModelId {
  return typeof value === "string" && MODEL_IDS.has(value);
}

export function getLlmModel(id: LlmModelId) {
  return LLM_MODELS.find((model) => model.id === id)!;
}

/** Resolve a client-requested model, falling back to env then default. */
export function resolveLlmModelId(requested?: unknown): LlmModelId {
  if (isLlmModelId(requested)) return requested;

  const fromEnv =
    process.env.AZURE_MODEL?.trim() || process.env.LLM_MODEL?.trim();
  if (isLlmModelId(fromEnv)) return fromEnv;

  return DEFAULT_LLM_MODEL_ID;
}

/**
 * Map catalog model IDs to Azure deployment names.
 * Defaults to the catalog id; override per tier with env when deployments differ.
 */
export function resolveAzureDeploymentName(modelId: LlmModelId): string {
  const overrides: Record<LlmModelId, string | undefined> = {
    "gpt-5.6-luna": process.env.AZURE_DEPLOYMENT_LUNA?.trim(),
    "gpt-5.6-terra": process.env.AZURE_DEPLOYMENT_TERRA?.trim(),
    "gpt-5.6-sol": process.env.AZURE_DEPLOYMENT_SOL?.trim(),
  };
  return overrides[modelId] || modelId;
}
