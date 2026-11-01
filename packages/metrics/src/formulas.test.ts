import { describe, expect, it } from "vitest";

import { MetricsInputError } from "./errors.js";
import {
  VOID_OPPORTUNITY_THRESHOLD_PCT,
  citationShares,
  isHighDifferentiationOpportunity,
  leaderGap,
  visibilityPct,
  voidRatePct,
} from "./formulas.js";
import { CONSENSUS_TOLERANCE_PTS, consensusFlag } from "./consensus.js";
import { sentimentIndex } from "./sentiment.js";

describe("visibilityPct", () => {
  it("computes the Monitor Skill §4 ratio", () => {
    expect(visibilityPct(3, 4)).toBe(75);
    expect(visibilityPct(0, 4)).toBe(0);
    expect(visibilityPct(4, 4)).toBe(100);
  });

  it("rounds repeating fractions to 2 decimals", () => {
    expect(visibilityPct(1, 3)).toBe(33.33);
  });

  it("rejects an empty denominator (0 runs)", () => {
    expect(() => visibilityPct(0, 0)).toThrow(MetricsInputError);
  });

  it("rejects a numerator outside [0, total]", () => {
    expect(() => visibilityPct(5, 4)).toThrow(MetricsInputError);
    expect(() => visibilityPct(-1, 4)).toThrow(MetricsInputError);
  });
});

describe("voidRatePct and the opportunity tag", () => {
  it("computes the share of answers recommending no monitored competitor", () => {
    expect(voidRatePct(1, 4)).toBe(25);
    expect(voidRatePct(0, 4)).toBe(0);
    expect(voidRatePct(4, 4)).toBe(100);
  });

  it("tags exactly-25% void as an opportunity (inclusive ≥)", () => {
    expect(VOID_OPPORTUNITY_THRESHOLD_PCT).toBe(25);
    expect(isHighDifferentiationOpportunity(25)).toBe(true);
    expect(isHighDifferentiationOpportunity(24.99)).toBe(false);
    expect(isHighDifferentiationOpportunity(50)).toBe(true);
  });

  it("rejects zero runs", () => {
    expect(() => voidRatePct(0, 0)).toThrow(MetricsInputError);
  });
});

describe("leaderGap", () => {
  it("computes top-1 competitor visibility minus brand visibility", () => {
    expect(
      leaderGap(40, [
        { competitorId: "brand_b", visibilityPct: 65 },
        { competitorId: "brand_a", visibilityPct: 20 },
      ]),
    ).toEqual({ topCompetitorId: "brand_b", gapPct: 25 });
  });

  it("is negative when the brand leads", () => {
    expect(
      leaderGap(80, [{ competitorId: "brand_ecoflow", visibilityPct: 40 }]),
    ).toEqual({ topCompetitorId: "brand_ecoflow", gapPct: -40 });
  });

  it("breaks visibility ties deterministically by competitor id", () => {
    expect(
      leaderGap(40, [
        { competitorId: "brand_jackery", visibilityPct: 65 },
        { competitorId: "brand_ecoflow", visibilityPct: 65 },
      ]),
    ).toEqual({ topCompetitorId: "brand_ecoflow", gapPct: 25 });
  });

  it("returns null together when no competitor has visibility", () => {
    expect(leaderGap(25, [{ competitorId: "brand_b", visibilityPct: 0 }])).toEqual({
      topCompetitorId: null,
      gapPct: null,
    });
    expect(leaderGap(25, [])).toEqual({ topCompetitorId: null, gapPct: null });
  });
});

describe("citationShares", () => {
  it("splits total citations across domains, largest first", () => {
    expect(citationShares({ "example.com": 3, "rival.example.com": 1 })).toEqual([
      { domain: "example.com", share_pct: 75 },
      { domain: "rival.example.com", share_pct: 25 },
    ]);
  });

  it("breaks share ties by domain ascending", () => {
    expect(citationShares({ "b.example.com": 1, "a.example.com": 1 })).toEqual([
      { domain: "a.example.com", share_pct: 50 },
      { domain: "b.example.com", share_pct: 50 },
    ]);
  });

  it("returns an empty array when nothing was cited (0/0 is undefined)", () => {
    expect(citationShares({})).toEqual([]);
    expect(citationShares({ "example.com": 0 })).toEqual([]);
  });
});

describe("sentimentIndex", () => {
  it("is neutral 50 with no brand statements", () => {
    expect(sentimentIndex([])).toBe(50);
  });

  it("maps the weighted mean polarity onto 0–100", () => {
    expect(sentimentIndex([{ text: "a", polarity: 1 }])).toBe(100);
    expect(sentimentIndex([{ text: "a", polarity: -1 }])).toBe(0);
    expect(
      sentimentIndex([
        { text: "a", polarity: 1 },
        { text: "b", polarity: -1 },
      ]),
    ).toBe(50);
    // sum 1, mean 0.25 → ((0.25 + 1) / 2) × 100 = 62.5
    expect(
      sentimentIndex([
        { text: "a", polarity: 1 },
        { text: "b", polarity: 1 },
        { text: "c", polarity: 0 },
        { text: "d", polarity: -1 },
      ]),
    ).toBe(62.5);
    // (+1, 0, −1) averages to 0 → dead-center neutral
    expect(
      sentimentIndex([
        { text: "a", polarity: 1 },
        { text: "b", polarity: 0 },
        { text: "c", polarity: -1 },
      ]),
    ).toBe(50);
  });
});

describe("consensusFlag", () => {
  it("is stable when all rounds agree within ±10 points", () => {
    expect(consensusFlag([100, 100])).toBe("stable");
    expect(consensusFlag([100, 90])).toBe("stable"); // exactly at tolerance
    expect(consensusFlag([50, 55, 60])).toBe("stable");
  });

  it("is noisy when any round diverges beyond the tolerance", () => {
    expect(consensusFlag([100, 89])).toBe("noisy");
    expect(consensusFlag([0, 50, 100])).toBe("noisy");
  });

  it("uses the documented ±10-point tolerance", () => {
    expect(CONSENSUS_TOLERANCE_PTS).toBe(10);
  });

  it("refuses to call consensus with fewer than 2 rounds", () => {
    expect(() => consensusFlag([])).toThrow(MetricsInputError);
    expect(() => consensusFlag([100])).toThrow(MetricsInputError);
  });
});
