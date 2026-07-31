const MODEL_ALIASES: Record<string, string> = {
  flash: "gemini-2.5-flash",
  pro: "gemini-2.5-pro",
  "gemini-flash": "gemini-2.5-flash",
  "gemini-pro": "gemini-2.5-pro",
};

/** Resolve GEMINI_MODEL env (aliases flash/pro) to an AI Studio model id. */
export function resolveGeminiModelId(
  raw: string | undefined = process.env.GEMINI_MODEL,
): string {
  const value = raw?.trim().toLowerCase();
  if (!value) return "gemini-2.5-flash";
  return MODEL_ALIASES[value] ?? raw!.trim();
}
