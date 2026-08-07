import { describe, expect, it } from "vitest";

import {
  MAX_ABS_BELIEF_DELTA,
  MAX_ABS_FORM_BELIEF,
  baselineExpectedPointsPerGw,
  computeBeliefExpectation,
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

describe("computeBeliefExpectation", () => {
  it("prefers ep_next as the per-GW baseline", () => {
    expect(
      baselineExpectedPointsPerGw({
        epNext: 6.2,
        form: 8,
        pointsPerGame: 5,
      }),
    ).toBe(6.2);
  });

  it("falls back to form/ppg blend when ep_next is missing", () => {
    const baseline = baselineExpectedPointsPerGw({
      epNext: 0,
      form: 8,
      pointsPerGame: 4,
    });
    expect(baseline).toBeCloseTo(8 * 0.55 + 4 * 0.45);
  });

  it("quantifies expected points over the horizon with belief adjustments", () => {
    const result = computeBeliefExpectation(
      { epNext: 5, form: 5, pointsPerGame: 5 },
      {
        formBelief: 1,
        minutesRisk: 0,
        confidence: 1,
        horizonGw: 3,
      },
    );
    // (5 + 1*1*0.75) * 1 * 3 = 17.25
    expect(result.baselinePerGw).toBe(5);
    expect(result.adjustedPerGw).toBeCloseTo(5.75);
    expect(result.expectedPoints).toBeCloseTo(17.25);
    expect(result.suggestedCeiling).toBeGreaterThan(result.expectedPoints);
    expect(result.suggestedFloor).toBeLessThan(result.expectedPoints);
  });

  it("reduces expected points when minutes risk is high", () => {
    const safe = computeBeliefExpectation(
      { epNext: 6, form: 6, pointsPerGame: 6 },
      { formBelief: 0, minutesRisk: 0, confidence: 1, horizonGw: 2 },
    );
    const risky = computeBeliefExpectation(
      { epNext: 6, form: 6, pointsPerGame: 6 },
      { formBelief: 0, minutesRisk: 1, confidence: 1, horizonGw: 2 },
    );
    expect(risky.expectedPoints).toBe(0);
    expect(safe.expectedPoints).toBeGreaterThan(risky.expectedPoints);
  });

  it("widens ceiling/floor bands when confidence is low", () => {
    const high = computeBeliefExpectation(
      { epNext: 5, form: 5, pointsPerGame: 5 },
      { formBelief: 0, minutesRisk: 0, confidence: 0.9, horizonGw: 3 },
    );
    const low = computeBeliefExpectation(
      { epNext: 5, form: 5, pointsPerGame: 5 },
      { formBelief: 0, minutesRisk: 0, confidence: 0.2, horizonGw: 3 },
    );
    const highSpread = high.suggestedCeiling - high.suggestedFloor;
    const lowSpread = low.suggestedCeiling - low.suggestedFloor;
    expect(lowSpread).toBeGreaterThan(highSpread);
  });
});
