import { describe, expect, it } from "vitest";
import {
  formatThreadUpdatedAt,
  getThreadArchiveCutoff,
  THREAD_ARCHIVE_AFTER_DAYS,
} from "./retention";

const now = new Date("2026-08-08T01:15:00.000Z");

describe("thread retention", () => {
  it("uses a one-week inactivity cutoff", () => {
    expect(getThreadArchiveCutoff(now)).toEqual(
      new Date("2026-08-01T01:15:00.000Z"),
    );
    expect(THREAD_ARCHIVE_AFTER_DAYS).toBe(7);
  });

  it("formats recent update times compactly", () => {
    expect(formatThreadUpdatedAt(new Date("2026-08-08T01:14:00.000Z"), now)).toBe(
      "1m",
    );
    expect(formatThreadUpdatedAt(new Date("2026-08-08T00:15:00.000Z"), now)).toBe(
      "1h",
    );
    expect(formatThreadUpdatedAt(new Date("2026-08-07T01:15:00.000Z"), now)).toBe(
      "1d",
    );
  });
});
