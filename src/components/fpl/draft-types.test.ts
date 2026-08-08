import { describe, expect, it } from "vitest";

import {
  draftFromSuggestResult,
  normalizePick,
  picksByPosition,
} from "@/components/fpl/draft-types";

describe("draft-types", () => {
  it("normalizes compact tool picks", () => {
    const pick = normalizePick({
      id: 10,
      name: "Saka",
      team: "ARS",
      position: "MID",
      cost: 10,
      form: 7.5,
      score: 12.3,
      pickPosition: 5,
      isCaptain: true,
      isViceCaptain: false,
      status: "a",
    });
    expect(pick.elementId).toBe(10);
    expect(pick.webName).toBe("Saka");
    expect(pick.recommendationScore).toBe(12.3);
    expect(pick.isCaptain).toBe(true);
  });

  it("groups picks by position", () => {
    const groups = picksByPosition([
      normalizePick({
        elementId: 1,
        webName: "Raya",
        position: "GKP",
        teamShort: "ARS",
        pickPosition: 1,
      }),
      normalizePick({
        elementId: 2,
        webName: "Haaland",
        position: "FWD",
        teamShort: "MCI",
        pickPosition: 11,
      }),
    ]);
    expect(groups.GKP).toHaveLength(1);
    expect(groups.FWD).toHaveLength(1);
    expect(groups.DEF).toHaveLength(0);
  });

  it("builds a draft summary from suggest_squad results", () => {
    const draft = draftFromSuggestResult({
      mode: "draft_100",
      valid: true,
      budget: 100,
      cost: 99.5,
      bank: 0.5,
      averageScore: 8.2,
      picks: [
        {
          id: 1,
          name: "Raya",
          team: "ARS",
          position: "GKP",
          cost: 5.5,
          pickPosition: 1,
        },
      ],
      saved: { id: "abc", title: "Saved draft", updatedAt: "2026-01-01" },
    });
    expect(draft?.id).toBe("abc");
    expect(draft?.title).toBe("Saved draft");
    expect(draft?.picks[0]?.webName).toBe("Raya");
  });

  it("does not create a draft from a failed suggestion", () => {
    expect(
      draftFromSuggestResult({
        error: "Active form thesis is still collecting beliefs.",
      }),
    ).toBeNull();
  });

  it("preserves a persisted draft status", () => {
    const draft = draftFromSuggestResult({
      mode: "draft_100",
      picks: [],
      saved: { id: "abc", status: "archived" },
    });
    expect(draft?.status).toBe("archived");
  });
});
