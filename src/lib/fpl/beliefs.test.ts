import { describe, expect, it } from "vitest";

import {
  MAX_ABS_BELIEF_DELTA,
  MAX_ABS_FORM_BELIEF,
  computeBeliefScoreDelta,
} from "@/lib/fpl/beliefs";

describe("computeBeliefScoreDelta", () => {
  it("returns 0 for a neutral prior", () => {
    expect(
      computeBeliefScoreDelta({
        formBelief: 0,
        minutesRisk: 0,
        confidence: 1,
      }),
    ).toBe(0);
  });

  it("boosts score for positive form belief scaled by confidence", () => {
    const full = computeBeliefScoreDelta({
      formBelief: 1,
      minutesRisk: 0,
      confidence: 1,
    });
    const half = computeBeliefScoreDelta({
      formBelief: 1,
      minutesRisk: 0,
      confidence: 0.5,
    });
    expect(full).toBeCloseTo(1.4);
    expect(half).toBeCloseTo(0.7);
    expect(full).toBeGreaterThan(half);
  });

  it("penalises minutes risk", () => {
    const delta = computeBeliefScoreDelta({
      formBelief: 0,
      minutesRisk: 1,
      confidence: 1,
    });
    expect(delta).toBeLessThan(0);
    expect(delta).toBeCloseTo(-3);
  });

  it("clamps extreme form beliefs and deltas", () => {
    const delta = computeBeliefScoreDelta({
      formBelief: 99,
      minutesRisk: 0,
      confidence: 1,
    });
    expect(delta).toBeLessThanOrEqual(MAX_ABS_BELIEF_DELTA);
    expect(delta).toBeCloseTo(MAX_ABS_FORM_BELIEF * 1.4);
  });
});
