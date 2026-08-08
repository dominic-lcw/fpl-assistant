export const THREAD_ARCHIVE_AFTER_DAYS = 7;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function getThreadArchiveCutoff(now = new Date()) {
  return new Date(now.getTime() - THREAD_ARCHIVE_AFTER_DAYS * DAY_MS);
}

export function formatThreadUpdatedAt(date: Date, now = new Date()) {
  const elapsed = Math.max(0, now.getTime() - date.getTime());

  if (elapsed < HOUR_MS) return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}m`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  return `${Math.floor(elapsed / DAY_MS)}d`;
}
