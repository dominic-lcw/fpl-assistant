export type TitleMessagePart = {
  type?: unknown;
  text?: unknown;
};

export type TitleMessage = {
  role?: unknown;
  content?: unknown;
};

const FALLBACK_TITLE = "New conversation";
const MAX_TITLE_LENGTH = 60;
const MAX_TRANSCRIPT_CHARS = 2_000;
const MAX_MESSAGES_FOR_TITLE = 6;

function partText(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const { type, text } = part as TitleMessagePart;
  if (type !== "text" || typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed || null;
}

/** Pull plain text from a ThreadMessage-like payload. */
export function messageText(message: TitleMessage): string {
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map(partText)
    .filter((text): text is string => Boolean(text))
    .join(" ")
    .trim();
}

/** Build a short transcript for the title model. */
export function buildTitleTranscript(messages: readonly TitleMessage[]): string {
  const lines: string[] = [];
  let used = 0;

  for (const message of messages.slice(0, MAX_MESSAGES_FOR_TITLE)) {
    const role =
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system"
        ? message.role
        : "message";
    const text = messageText(message);
    if (!text) continue;

    const line = `${role}: ${text}`;
    if (used + line.length > MAX_TRANSCRIPT_CHARS) {
      const remaining = MAX_TRANSCRIPT_CHARS - used;
      if (remaining > 20) lines.push(line.slice(0, remaining));
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }

  return lines.join("\n");
}

/** Fallback when the model is unavailable: first user message, truncated. */
export function fallbackTitleFromMessages(
  messages: readonly TitleMessage[],
): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return FALLBACK_TITLE;
  const text = messageText(firstUser);
  if (!text) return FALLBACK_TITLE;
  return sanitizeTitle(text) ?? FALLBACK_TITLE;
}

/** Normalize model output into a short sidebar-friendly title. */
export function sanitizeTitle(raw: string): string | null {
  let title = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^title\s*:\s*/i, "")
    .split(/\r?\n/)[0]
    ?.trim();

  if (!title) return null;
  title = title.replace(/\s+/g, " ");
  if (title.length > MAX_TITLE_LENGTH) {
    title = `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
  }
  return title || null;
}

export const TITLE_SYSTEM_PROMPT = `You name Fantasy Premier League chat threads.
Return ONLY a short title (3–8 words). No quotes, no punctuation fluff, no "Title:".
Prefer player names, gameweeks, captains, transfers, or the user's ask.
Examples: "GW32 captain picks", "Salah vs Palmer", "Free-hit squad build".`;
