import { describe, expect, it } from "vitest";

import {
  EMPTY_BELIEFS_CONTEXT,
  formatBeliefAssistantContext,
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

describe("formatBeliefAssistantContext", () => {
  it("treats empty leftover thesis shells as no beliefs", () => {
    const context = formatBeliefAssistantContext({
      id: "t1",
      title: "GW1 safer keeper rotation",
      status: "synthesized",
      summary:
        "downgrading Benítez & Ellborg due to rotation risk, targeting a nailed £4.5m–£5.0m starter",
      gameweek: 1,
      horizonGw: 3,
      linkedDraftId: null,
      beliefCount: 0,
      beliefs: [],
    });
    expect(context).toBe(EMPTY_BELIEFS_CONTEXT);
    expect(context).not.toContain("GW1 safer keeper");
    expect(context).not.toContain("Benítez");
  });

  it("lists player beliefs without thesis ceremony language", () => {
    const context = formatBeliefAssistantContext({
      id: "t1",
      title: "Active beliefs",
      status: "collecting",
      summary: "should not appear",
      gameweek: 1,
      horizonGw: 3,
      linkedDraftId: null,
      beliefCount: 1,
      beliefs: [
        {
          id: "b1",
          thesisId: "t1",
          elementId: 10,
          name: "Saka",
          team: "ARS",
          position: "MID",
          formBelief: 1,
          minutesRisk: 0.1,
          confidence: 0.8,
          beliefDelta: 0.9,
          expectedPoints: 18,
          ceiling: 22,
          floor: 14,
          horizonGw: 3,
          rationale: "Strong xGI",
          sources: [],
        },
      ],
    });
    expect(context).toContain("Active player beliefs: 1");
    expect(context).toContain("Saka");
    expect(context).not.toContain("should not appear");
    expect(context).toContain("speak in player beliefs and squad drafts");
  });
});
