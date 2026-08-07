import { describe, expect, it } from "vitest";

import {
  normalizeBelief,
  thesisFromToolResult,
} from "@/components/fpl/thesis-types";

describe("thesis tool result parsing", () => {
  it("normalizes a belief payload", () => {
    const belief = normalizeBelief({
      id: "b1",
      thesisId: "t1",
      elementId: 10,
      name: "Saka",
      team: "ARS",
      position: "MID",
      formBelief: 1.5,
      minutesRisk: 0.2,
      confidence: 0.8,
      beliefDelta: 1.2,
      expectedPoints: 18.4,
      ceiling: 21,
      floor: 15,
      horizonGw: 3,
      rationale: "Underlying xGI strong",
      sources: ["get_player_detailed_data"],
    });
    expect(belief.name).toBe("Saka");
    expect(belief.formBelief).toBe(1.5);
    expect(belief.beliefDelta).toBe(1.2);
    expect(belief.expectedPoints).toBe(18.4);
    expect(belief.ceiling).toBe(21);
    expect(belief.floor).toBe(15);
  });

  it("builds an active thesis view from upsert-style results", () => {
    const thesis = thesisFromToolResult({
      thesis: {
        id: "t1",
        title: "GW4 differentials",
        status: "collecting",
        summary: null,
        horizonGw: 3,
      },
      belief: {
        id: "b1",
        thesisId: "t1",
        elementId: 10,
        name: "Saka",
        formBelief: 1,
        minutesRisk: 0,
        confidence: 1,
        beliefDelta: 1.4,
        horizonGw: 3,
        rationale: "Press + fixtures",
        sources: [],
      },
    });
    expect(thesis?.title).toBe("GW4 differentials");
    expect(thesis?.beliefs).toHaveLength(1);
    expect(thesis?.beliefs[0]?.name).toBe("Saka");
  });
});
