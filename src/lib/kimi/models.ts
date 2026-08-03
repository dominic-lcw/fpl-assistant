export const KIMI_MODELS = [
  {
    id: "kimi-k3",
    label: "Kimi K3",
    contextWindow: 1_000_000,
  },
  {
    id: "kimi-k2.7-code",
    label: "Kimi K2.7",
    contextWindow: 256_000,
  },
] as const;

export type KimiModelId = (typeof KIMI_MODELS)[number]["id"];

export const DEFAULT_KIMI_MODEL_ID: KimiModelId = "kimi-k3";

export const KIMI_MODEL_STORAGE_KEY = "fpl-assistant.kimiModel";

const MODEL_IDS = new Set<string>(KIMI_MODELS.map((model) => model.id));

export function isKimiModelId(value: unknown): value is KimiModelId {
  return typeof value === "string" && MODEL_IDS.has(value);
}

export function getKimiModel(id: KimiModelId) {
  return KIMI_MODELS.find((model) => model.id === id)!;
}

/** Resolve a client-requested model, falling back to env then default. */
export function resolveKimiModelId(requested?: unknown): KimiModelId {
  if (isKimiModelId(requested)) return requested;

  const fromEnv = process.env.KIMI_MODEL?.trim();
  if (isKimiModelId(fromEnv)) return fromEnv;

  return DEFAULT_KIMI_MODEL_ID;
}
