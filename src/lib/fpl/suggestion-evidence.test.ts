import { describe, expect, it } from "vitest";

import {
  buildComparisonRows,
  researchTargetsFromSuggestions,
  toCompactSuggestionPlayer,
} from "./suggestion-evidence";
import type { PlayerFormSummary } from "./types";

function player(
  overrides: Partial<PlayerFormSummary> & Pick<PlayerFormSummary, "id" | "webName">,
): PlayerFormSummary {
  return {
    teamId: 1,
    teamShort: "ARS",
    position: "MID",
    cost: 10,
    form: 5,
    pointsPerGame: 5,
    totalPoints: 50,
    expectedGoalInvolvements: 3,
    selectedByPercent: 20,
    status: "a",
    news: "",
    chanceOfPlayingNextRound: 100,
    recentPoints: 20,
    recentMinutes: 270,
    recentXgi: 1.5,
    fixtureRunScore: 7,
    nextFixtures: [
      { event: 2, opponent: "BHA", isHome: true, difficulty: 2 },
      { event: 3, opponent: "CHE", isHome: false, difficulty: 4 },
    ],
    recommendationScore: 20,
    ...overrides,
  };
}

describe("suggestion evidence", () => {
  it("flags players that need a news check", () => {
    const injured = toCompactSuggestionPlayer(
      player({
        id: 1,
        webName: "Saka",
        status: "d",
        news: "Knock",
        chanceOfPlayingNextRound: 50,
      }),
    );
    expect(injured.needsNewsCheck).toBe(true);
    expect(injured.fixturesLabel).toContain("BHA(H,FDR2)");
  });

  it("builds comparison rows with why text for the leader", () => {
    const rows = buildComparisonRows([
      player({ id: 1, webName: "Saka", form: 8, recommendationScore: 30 }),
      player({
        id: 2,
        webName: "Palmer",
        teamShort: "CHE",
        form: 6,
        expectedGoalInvolvements: 5,
        recommendationScore: 28,
      }),
    ]);
    expect(rows[0]?.why).toMatch(/Leads/i);
    expect(rows).toHaveLength(2);
  });

  it("collects research targets from suggestion lists", () => {
    const targets = researchTargetsFromSuggestions({
      captains: [
        toCompactSuggestionPlayer(
          player({ id: 1, webName: "Haaland", status: "d", news: "Knock" }),
        ),
      ],
      transferOut: [],
      transferIn: [
        toCompactSuggestionPlayer(player({ id: 2, webName: "Salah", status: "a" })),
      ],
    });
    expect(targets.some((t) => t.includes("Haaland"))).toBe(true);
    expect(targets.some((t) => t.includes("Salah"))).toBe(false);
  });
});
