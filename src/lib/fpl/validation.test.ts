import { describe, expect, it } from "vitest";

import { squadDraftPicksSchema } from "@/lib/fpl/validation";

function makePicks() {
  const elementTypes = [
    1,
    1,
    2,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
  ] as const;
  const positions = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;

  return elementTypes.map((elementType, index) => ({
    elementId: index + 1,
    webName: `Player ${index + 1}`,
    teamId: index + 1,
    teamShort: `T${index + 1}`,
    position: positions[elementType],
    elementType,
    cost: 5,
    pickPosition: index + 1,
    isCaptain: index === 0,
    isViceCaptain: index === 1,
    form: 2,
    pointsPerGame: 3,
    totalPoints: 10,
    fixtureRunScore: 1,
    recommendationScore: 4,
    status: "a",
  }));
}

describe("squadDraftPicksSchema", () => {
  it("accepts a complete canonical 15-player payload", () => {
    expect(squadDraftPicksSchema.safeParse(makePicks()).success).toBe(true);
  });

  it("rejects malformed picks and mismatched positions", () => {
    const malformed = makePicks();
    malformed[0] = { ...malformed[0]!, position: "MID" };
    expect(squadDraftPicksSchema.safeParse(malformed).success).toBe(false);
    expect(squadDraftPicksSchema.safeParse(malformed.slice(0, 14)).success).toBe(
      false,
    );
  });
});
